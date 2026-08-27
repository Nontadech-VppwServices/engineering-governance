import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type ExecutionPhase = 'analyze' | 'plan' | 'implement';

export interface Request {
  schema_version: 1;
  job_id: string;
  jira_issue_key: string;
  work_type: string;
  execution_phase?: ExecutionPhase;
  objective?: string | null;
  repository: string;
  base_branch: string;
  working_branch: string;
  effective_context: { project: { archetype?: string | null } };
  constraints: {
    allow_merge: false;
    allow_production_deploy: false;
    allow_production_credentials: false;
  };
}

export interface Gate {
  key: string;
  required: boolean;
  status: 'passed' | 'failed' | 'not_run' | 'not_applicable';
  details?: string;
}

export interface Result {
  schema_version: 1;
  job_id: string;
  repository: string;
  execution_phase: ExecutionPhase;
  hermes_run_id: string | null;
  artifact_content: string | null;
  status: 'completed' | 'blocked' | 'failed' | 'analysis_only';
  summary: string;
  commit_sha: string | null;
  changed_files: string[];
  quality_gates: Gate[];
  blocking_reason: string | null;
}

export interface Config {
  workspaceRoot: string;
  githubToken: string;
  hermesUrl: string;
  hermesKey: string;
  mode: 'hermes' | 'mock';
}

interface HermesEvidence {
  runId: string | null;
  output: string;
}

export class AgentRunner {
  constructor(private readonly config: Config) {}

  async execute(request: Request): Promise<Result> {
    validate(request);
    const phase = request.execution_phase ?? 'implement';
    const dir = resolve(this.config.workspaceRoot, safe(request.job_id), safe(request.repository));
    if (!dir.startsWith(resolve(this.config.workspaceRoot) + sep)) throw new Error('Unsafe workspace path.');

    await rm(dir, { recursive: true, force: true });
    const env = {
      ...process.env,
      GITHUB_TOKEN: this.config.githubToken,
      GIT_ASKPASS: '/usr/local/bin/git-askpass',
      GIT_TERMINAL_PROMPT: '0',
    };

    const cloneBranch = phase === 'implement' ? request.working_branch : request.base_branch;
    await run(
      'git',
      ['clone', '--branch', cloneBranch, '--single-branch', `https://github.com/${request.repository}.git`, dir],
      undefined,
      env,
    );

    const evidence = this.config.mode === 'hermes'
      ? await this.runHermes(request, phase, dir)
      : await this.runMock(phase, dir);

    const changed = await changedFiles(dir, env);

    if (phase !== 'implement') {
      if (changed.length > 0) {
        return result(
          request,
          phase,
          'blocked',
          `${phase} is a read-only execution phase but repository changes were detected.`,
          null,
          changed,
          [],
          'READ_ONLY_PHASE_MODIFIED_FILES',
          evidence,
        );
      }
      return result(
        request,
        phase,
        'analysis_only',
        `Hermes ${phase} execution completed without repository modification.`,
        null,
        [],
        [],
        null,
        evidence,
      );
    }

    if (!changed.length) {
      return result(
        request,
        phase,
        'blocked',
        'Hermes implementation produced no repository changes.',
        null,
        [],
        [],
        'NO_CHANGES',
        evidence,
      );
    }

    const gates = await qualityGates(dir, request.effective_context.project.archetype ?? '', env);
    if (gates.some((gate) => gate.required && gate.status !== 'passed')) {
      return result(
        request,
        phase,
        'failed',
        'Trusted quality gates failed.',
        null,
        changed,
        gates,
        'QUALITY_GATES_FAILED',
        evidence,
      );
    }

    await run('git', ['add', '--all'], dir, env);
    await run(
      'git',
      [
        '-c',
        'user.name=AI SDLC',
        '-c',
        'user.email=ai-sdlc@localhost',
        'commit',
        '-m',
        `${request.jira_issue_key}: AI-assisted implementation`,
      ],
      dir,
      env,
    );
    await run('git', ['merge-base', '--is-ancestor', `origin/${request.base_branch}`, 'HEAD'], dir, env);
    await run('git', ['push', 'origin', `HEAD:${request.working_branch}`], dir, env);
    const sha = (await run('git', ['rev-parse', 'HEAD'], dir, env)).trim();

    return result(
      request,
      phase,
      'completed',
      'Implementation edited by Hermes, independently verified, committed and pushed by the trusted runner.',
      sha,
      changed,
      gates,
      null,
      evidence,
    );
  }

  private async runMock(phase: ExecutionPhase, dir: string): Promise<HermesEvidence> {
    if (phase === 'implement') {
      await writeFile(join(dir, '.ai-sdlc-mock.txt'), 'mock agent execution\n', 'utf8');
    }
    return {
      runId: `mock:${phase}`,
      output: phase === 'analyze'
        ? 'Mock analysis: repository inspected; no changes made.'
        : phase === 'plan'
          ? 'Mock plan: implement the scoped change and verify required quality gates.'
          : 'Mock implementation completed.',
    };
  }

  private async runHermes(request: Request, phase: ExecutionPhase, dir: string): Promise<HermesEvidence> {
    const response = await fetch(`${this.config.hermesUrl.replace(/\/$/, '')}/v1/runs`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.hermesKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: `coder:${safe(request.job_id)}:${phase}:${safe(request.repository)}`,
        input: buildHermesInput(request, phase, dir),
        instructions: JSON.stringify({
          execution_phase: phase,
          objective: request.objective ?? null,
          request: {
            ...request,
            execution_phase: phase,
            constraints: request.constraints,
          },
        }),
      }),
    });
    if (!response.ok) throw new Error(`Hermes execution plane returned HTTP ${response.status}.`);

    const created = await response.json() as { run_id?: string };
    if (!created.run_id) throw new Error('Hermes execution plane did not return run_id.');

    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
      const poll = await fetch(
        `${this.config.hermesUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(created.run_id)}`,
        { headers: { authorization: `Bearer ${this.config.hermesKey}` } },
      );
      if (!poll.ok) throw new Error(`Hermes run poll returned HTTP ${poll.status}.`);
      const state = await poll.json() as { status?: string; output?: unknown };
      if (state.status === 'completed') {
        return {
          runId: created.run_id,
          output: sanitizeArtifact(typeof state.output === 'string' ? state.output : ''),
        };
      }
      if (['failed', 'stopped', 'cancelled'].includes(String(state.status))) {
        throw new Error(`Hermes execution plane ended with ${state.status}.`);
      }
    }
    throw new Error('Hermes execution plane timed out.');
  }
}

function buildHermesInput(request: Request, phase: ExecutionPhase, dir: string): string {
  const objective = request.objective?.trim() || `Jira ${request.jira_issue_key}`;
  const common = [
    'Use the ai-sdlc-execution skill.',
    `Execution phase: ${phase.toUpperCase()}.`,
    `Assigned repository: ${request.repository}.`,
    `Work only inside ${dir}.`,
    `Objective: ${objective}`,
    'Follow the supplied Effective Context and engineering-governance skill.',
    'Do not access credentials, commit, push, merge, deploy, or change repository routing.',
  ];
  if (phase === 'analyze') {
    common.push('This phase is read-only. Inspect repository evidence and return root-cause/impact findings. Do not modify files.');
  } else if (phase === 'plan') {
    common.push('This phase is read-only. Return an implementation/test plan with risks and unresolved questions. Do not modify files.');
  } else {
    common.push('Implement the scoped change by editing files only. Do not commit or push; the trusted runner owns Git writes and independent tests.');
  }
  return common.join('\n');
}

function validate(request: Request): void {
  const parts = request.repository.split('/');
  const phase = request.execution_phase ?? 'implement';
  if (
    request.schema_version !== 1
    || !request.job_id
    || !['analyze', 'plan', 'implement'].includes(phase)
    || parts.length !== 2
    || parts.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9_.-]+$/.test(part))
    || !/^[A-Za-z0-9._\/-]+$/.test(request.working_branch)
    || request.working_branch.includes('..')
    || !/^[A-Za-z0-9._\/-]+$/.test(request.base_branch)
    || request.base_branch.includes('..')
    || request.constraints.allow_merge !== false
    || request.constraints.allow_production_deploy !== false
    || request.constraints.allow_production_credentials !== false
  ) throw new Error('Invalid agent execution request.');
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 120);
}

async function run(command: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const value = await exec(command, args, { cwd, env, maxBuffer: 10 * 1024 * 1024 });
  return value.stdout;
}

async function changedFiles(cwd: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const output = await run('git', ['status', '--porcelain=v1'], cwd, env);
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => file && !file.includes('..'));
}

async function qualityGates(cwd: string, archetype: string, env: NodeJS.ProcessEnv): Promise<Gate[]> {
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  } catch {
    return [{ key: 'repository', required: true, status: 'failed', details: 'package.json missing' }];
  }

  if (await exists(join(cwd, 'package-lock.json'))) await run('npm', ['ci', '--ignore-scripts'], cwd, env);
  const scripts = pkg.scripts ?? {};
  const names = [
    ['typecheck', 'typecheck'],
    ['test', 'test'],
    ['build', 'build'],
    ['api', 'test:api'],
    ['e2e', 'test:e2e'],
  ] as const;
  const gates: Gate[] = [];

  for (const [key, script] of names) {
    if (!scripts[script]) continue;
    try {
      await run('npm', ['run', script], cwd, env);
      gates.push({ key, required: true, status: 'passed' });
    } catch (error) {
      gates.push({
        key,
        required: true,
        status: 'failed',
        details: error instanceof Error ? error.message.slice(0, 500) : 'failed',
      });
    }
  }

  if (archetype === 'aws-nextjs-typescript') {
    for (const key of ['api', 'e2e']) {
      if (!gates.some((gate) => gate.key === key)) {
        gates.push({ key, required: true, status: 'not_run', details: `${key} script missing` });
      }
    }
  }
  return gates;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeArtifact(value: string): string {
  return value
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1<redacted>')
    .slice(0, 100000);
}

function result(
  request: Request,
  phase: ExecutionPhase,
  status: Result['status'],
  summary: string,
  sha: string | null,
  files: string[],
  gates: Gate[],
  reason: string | null,
  evidence: HermesEvidence,
): Result {
  return {
    schema_version: 1,
    job_id: request.job_id,
    repository: request.repository,
    execution_phase: phase,
    hermes_run_id: evidence.runId,
    artifact_content: evidence.output || null,
    status,
    summary,
    commit_sha: sha,
    changed_files: files,
    quality_gates: gates,
    blocking_reason: reason,
  };
}
