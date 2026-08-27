import { Queue, type ConnectionOptions } from 'bullmq';
import type { QueuePort } from '../ports.js';
import type { IntakeEvent } from '../types.js';

export class BullMqIntakeQueue implements QueuePort {
  private readonly queue: Queue<IntakeEvent>;

  constructor(connection: ConnectionOptions, queueName = 'ai-sdlc-intake') {
    this.queue = new Queue<IntakeEvent>(queueName, { connection });
  }

  async enqueue(event: IntakeEvent): Promise<void> {
    await this.queue.add('jira-intake', event, {
      jobId: event.event_id,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
