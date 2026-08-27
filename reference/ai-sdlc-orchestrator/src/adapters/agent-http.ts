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
    const value = await response.json() as unknown;
    if (!isAgentExecutionResult(value, request)) throw new Error('Agent execution endpoint returned an invalid contract.');
    return value;
  }
}

function isAgentExecutionResult(value: unknown, request: AgentExecutionRequest): value is AgentExecutionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<AgentExecutionResult>;
  return result.schema_version === 1
    && result.job_id === request.job_id
    && result.repository === request.repository
    && ['completed', 'blocked', 'failed', 'analysis_only'].includes(String(result.status))
    && Array.isArray(result.changed_files)
    && result.changed_files.every((item) => typeof item === 'string' && !item.includes('..'))
    && Array.isArray(result.quality_gates)
    && result.quality_gates.every((gate) => gate && typeof gate.key === 'string' && typeof gate.required === 'boolean' && ['passed', 'failed', 'not_run', 'not_applicable'].includes(gate.status));
}
