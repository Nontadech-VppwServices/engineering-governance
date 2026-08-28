import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { GovernanceError, type QualityGateVerdict } from './types.js';
import { safe } from './sanitize.js';

const exec = promisify(execFile);

// Replaces reference/agent-runner. Hermes edits files in the shared workspace
// with its own filesystem tools; only this module holds the Git credential and
// only it commits or pushes, and only after gates pass.

// A gate key resolves server-side to a fixed command. Arbitrary shell is never
// accepted from a tool caller (policies/ai-sdlc-mcp.md).
const GATE_COMMANDS: Record<string, readonly string[]> = {
  typecheck: ['npm', 'run', '--if-present', 'typecheck'],
  lint: ['npm', 'run', '--if-present', 'lint'],
  test: ['npm', 'test', '--if-present'],
  build: ['npm', 'run', '--if-present', 'build'],
  api: ['npm', 'run', '--if-present', 'test:api'],
  e2e: ['npm', 'run', '--if-present', 'test:e2e'],
};

// Ported from ai-sdlc-orchestrator/src/quality.ts.
const REQUIRED_GATES_BY_ARCHETYPE: Record<string, readonly string[]> = {
  'aws-nextjs-typescript': ['typecheck', 'test', 'api', 'e2e'],
  'onprem-playwright-typescript-rpa': ['typecheck', 'test'],
};

export function requiredGates(archetype: string | null | undefined): readonly string[] {
  return REQUIRED_GATES_BY_ARCHETYPE[archetype ?? ''] ?? ['typecheck', 'test'];
}

export function isKnownGate(key: string): boolean {
  return Object.hasOwn(GATE_COMMANDS, key);
}

export interface WorkspaceConfig {
  workspaceRoot: string;
  githubToken: string;
  hermesUid: string;
  hermesGid: string;
  gateTimeoutMs: number;
}

export class WorkspaceManager {
  constructor(private readonly config: WorkspaceConfig) {}

  // Path containment: a job_id or repository that tries to escape the root is
  // rejected before any filesystem call.
  workspacePath(jobId: string, repository: string): string {
    const dir = resolve(this.config.workspaceRoot, segment(jobId), segment(repository));
    if (!dir.startsWith(resolve(this.config.workspaceRoot) + sep)) {
      throw new GovernanceError('Unsafe workspace path.', 403, 'FORBIDDEN');
    }
    return dir;
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      GITHUB_TOKEN: this.config.githubToken,
      GIT_ASKPASS: '/usr/local/bin/git-askpass',
      GIT_TERMINAL_PROMPT: '0',
    };
  }

  async prepare(input: {
    jobId: string;
    repository: string;
    baseBranch: string;
    workingBranch: string;
  }): Promise<{ path: string; base_branch: string; working_branch: string }> {
    const dir = this.workspacePath(input.jobId, input.repository);
    // Tokenless remote: the credential is supplied at call time through
    // GIT_ASKPASS, so it never lands in .git/config where Hermes could read it.
    const url = `https://github.com/${input.repository}.git`;

    if (await exists(join(dir, '.git'))) {
      await this.run(['fetch', 'origin', input.baseBranch, '--depth', '50'], dir);
    } else {
      await this.run(['clone', '--branch', input.baseBranch, '--single-branch', '--depth', '50', url, dir]);
    }
    await this.run(['-C', dir, 'checkout', '-B', input.workingBranch]);

    // Hand the tree to the Hermes uid so the agent can edit it in place.
    await exec('chown', ['-R', `${this.config.hermesUid}:${this.config.hermesGid}`, dir]).catch(() => undefined);

    return { path: dir, base_branch: input.baseBranch, working_branch: input.workingBranch };
  }

  async changedFiles(jobId: string, repository: string): Promise<string[]> {
    const dir = this.workspacePath(jobId, repository);
    const output = await this.run(['-C', dir, 'status', '--porcelain']);
    return output
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  }

  async runGate(input: {
    jobId: string;
    repository: string;
    gateKey: string;
    archetype: string | null;
  }): Promise<QualityGateVerdict> {
    const command = GATE_COMMANDS[input.gateKey];
    if (!command) {
      throw new GovernanceError(
        `Unknown quality gate '${input.gateKey}'. Arbitrary commands are not accepted.`,
        400,
        'UNKNOWN_GATE',
      );
    }
    const dir = this.workspacePath(input.jobId, input.repository);
    const required = requiredGates(input.archetype).includes(input.gateKey);

    if (!(await exists(join(dir, 'package.json')))) {
      return { key: input.gateKey, required, status: 'not_applicable', details: 'No package.json in workspace.' };
    }

    try {
      const [file, ...args] = command;
      const { stdout } = await exec(file!, args, {
        cwd: dir,
        env: this.env(),
        timeout: this.config.gateTimeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
      return { key: input.gateKey, required, status: 'passed', details: safe(tail(stdout)) };
    } catch (error) {
      const details = safe(tail(errorOutput(error)));
      return { key: input.gateKey, required, status: 'failed', details };
    }
  }

  async commitAndPush(input: {
    jobId: string;
    repository: string;
    baseBranch: string;
    workingBranch: string;
    message: string;
  }): Promise<{ commit_sha: string; changed_files: string[]; pushed: true }> {
    const dir = this.workspacePath(input.jobId, input.repository);
    const changed = await this.changedFiles(input.jobId, input.repository);
    if (!changed.length) {
      throw new GovernanceError('No repository changes to commit.', 409, 'NO_CHANGES');
    }

    await this.run(['-C', dir, 'add', '--all']);
    await this.run([
      '-C', dir,
      '-c', 'user.name=AI SDLC',
      '-c', 'user.email=ai-sdlc@localhost',
      'commit', '-m', input.message,
    ]);
    // Refuse to push a branch that has diverged from its base.
    await this.run(['-C', dir, 'fetch', 'origin', input.baseBranch]);
    await this.run(['-C', dir, 'merge-base', '--is-ancestor', `origin/${input.baseBranch}`, 'HEAD']);
    await this.run(['-C', dir, 'push', 'origin', `HEAD:${input.workingBranch}`]);

    const sha = (await this.run(['-C', dir, 'rev-parse', 'HEAD'])).trim();
    return { commit_sha: sha, changed_files: changed, pushed: true };
  }

  private async run(args: string[], cwd?: string): Promise<string> {
    try {
      const { stdout } = await exec('git', args, {
        ...(cwd ? { cwd } : {}),
        env: this.env(),
        maxBuffer: 8 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      throw new GovernanceError(`git ${args[0]} failed: ${safe(errorOutput(error))}`, 500, 'GIT_ERROR');
    }
  }
}

function segment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_');
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function tail(value: string, lines = 40): string {
  return value.split('\n').slice(-lines).join('\n');
}

function errorOutput(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    return e.stderr || e.stdout || e.message || 'command failed';
  }
  return 'command failed';
}
