import type { AgentExecutionResult, EffectiveContextView, QualityGateResult } from './types.js';

export interface QualityEvaluation {
  passed: boolean;
  failures: string[];
}

export function evaluateQualityGates(
  context: EffectiveContextView,
  result: AgentExecutionResult,
): QualityEvaluation {
  const required = result.quality_gates.filter((gate) => gate.required);
  const failures = required
    .filter((gate) => gate.status !== 'passed')
    .map((gate) => `${gate.key}:${gate.status}`);

  const archetype = context.project.archetype ?? '';
  const isAwsWeb = archetype === 'aws-nextjs-typescript';

  if (isAwsWeb) {
    requireNamedGate(result.quality_gates, 'api', failures);
    requireNamedGate(result.quality_gates, 'e2e', failures);
  }

  return { passed: failures.length === 0, failures: [...new Set(failures)] };
}

function requireNamedGate(gates: QualityGateResult[], key: string, failures: string[]): void {
  const gate = gates.find((item) => item.key.toLowerCase() === key);
  if (!gate) {
    failures.push(`${key}:missing`);
    return;
  }
  if (gate.status !== 'passed') {
    failures.push(`${key}:${gate.status}`);
  }
}
