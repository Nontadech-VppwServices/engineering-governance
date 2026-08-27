import { Worker, type ConnectionOptions } from 'bullmq';
import type { AiSdlcOrchestrator } from '../orchestrator.js';
import type { IntakeEvent } from '../types.js';

export class BullMqWorkerRuntime {
  private readonly worker: Worker<IntakeEvent>;

  constructor(
    connection: ConnectionOptions,
    orchestrator: AiSdlcOrchestrator,
    queueName = 'ai-sdlc-intake',
  ) {
    this.worker = new Worker<IntakeEvent>(
      queueName,
      async (job) => orchestrator.processIntake(job.data),
      { connection, concurrency: 2 },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
