import type { Pool } from 'pg';
import { safe } from './sanitize.js';

// Transactional outbox. Ported from rpa-reporting/src/worker.ts tick(). The
// scheduling half of that worker is gone: Hermes cron decides *when* a report
// runs, but delivery guarantees stay here because exactly-once-ish delivery
// with crash recovery is not a prompt-shaped problem.

export interface OutboxConfig {
  lineAccessToken: string;
  allowedTargetIds: string;
  maxAttempts: number;
  intervalMs: number;
}

export class OutboxWorker {
  private timer?: NodeJS.Timeout;
  private lastTickAt = 0;
  private readonly allowed: Set<string>;

  constructor(
    private readonly pool: Pool,
    private readonly config: OutboxConfig,
  ) {
    this.allowed = new Set(
      config.allowedTargetIds.split(',').map((value) => value.trim()).filter(Boolean),
    );
  }

  get healthy(): boolean {
    return this.lastTickAt > 0 && Date.now() - this.lastTickAt < this.config.intervalMs * 3;
  }

  async start(): Promise<void> {
    await this.tick().catch(() => undefined);
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => {
      void this.tick()
        .then(() => {
          this.lastTickAt = Date.now();
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              service: 'governance-mcp',
              worker: 'outbox',
              error: safe(error instanceof Error ? error.message : 'tick failed'),
            }),
          );
        });
    }, this.config.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query<{ id: string; target_id: string; message: string; attempts: number }>(
        `SELECT id,target_id,message,attempts FROM notification_outbox
         WHERE status='PENDING' AND next_attempt_at<=now()
         ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`,
      );
      for (const row of rows.rows) {
        try {
          await this.deliver(row.id, row.target_id, row.message);
          await client.query(
            "UPDATE notification_outbox SET status='DELIVERED',delivered_at=now() WHERE id=$1",
            [row.id],
          );
        } catch (error) {
          const attempts = row.attempts + 1;
          await client.query(
            `UPDATE notification_outbox
             SET attempts=$2,status=$3,last_error=$4,next_attempt_at=now()+make_interval(secs=>$5)
             WHERE id=$1`,
            [
              row.id,
              attempts,
              attempts >= this.config.maxAttempts ? 'DEAD_LETTER' : 'PENDING',
              safe(error instanceof Error ? error.message : 'delivery failed'),
              Math.min(3600, 2 ** attempts * 5),
            ],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async deliver(id: string, targetId: string, message: string): Promise<void> {
    if (!this.allowed.has(targetId)) throw new Error('target_not_allowed');
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.lineAccessToken}`,
        'content-type': 'application/json',
        'x-line-retry-key': id,
      },
      body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text: safe(message) }] }),
    });
    if (!response.ok) throw new Error(`LINE returned HTTP ${response.status}.`);
  }
}
