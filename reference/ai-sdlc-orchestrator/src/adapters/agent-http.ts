import type { AgentRunnerPort } from '../ports.js';
import type { AgentExecutionRequest, AgentExecutionResult } from '../types.js';

export class AgentHttpAdapter implements AgentRunnerPort {
  constructor(
    private readonly endpoint: string,
    private readonly authorization?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.authorization ? { authorization: this.authorization } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Agent execution endpoint returned HTTP ${response.status}.`);
    return (await response.json()) as AgentExecutionResult;
  }
}
