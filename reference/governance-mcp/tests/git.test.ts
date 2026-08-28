import { describe, expect, it } from 'vitest';
import { isKnownGate, requiredGates, WorkspaceManager } from '../src/git.js';

const manager = new WorkspaceManager({
  workspaceRoot: '/workspaces',
  githubToken: 'x',
  hermesUid: '10000',
  hermesGid: '10000',
  gateTimeoutMs: 1000,
});

describe('quality gates', () => {
  it('accepts only named gates', () => {
    expect(isKnownGate('typecheck')).toBe(true);
    expect(isKnownGate('e2e')).toBe(true);
    expect(isKnownGate('rm -rf /')).toBe(false);
    expect(isKnownGate('npm run whatever')).toBe(false);
  });

  it('requires api and e2e for the AWS web archetype', () => {
    expect(requiredGates('aws-nextjs-typescript')).toContain('api');
    expect(requiredGates('aws-nextjs-typescript')).toContain('e2e');
  });

  it('falls back to a safe default for an unknown archetype', () => {
    expect(requiredGates(null)).toEqual(['typecheck', 'test']);
  });
});

describe('workspace path containment', () => {
  it('builds a path inside the workspace root', () => {
    expect(manager.workspacePath('job-1', 'org/repo')).toBe('/workspaces/job-1/org_repo');
  });

  it('neutralises traversal in the job id and repository', () => {
    expect(manager.workspacePath('../../etc', 'org/repo')).toBe('/workspaces/.._.._etc/org_repo');
    expect(manager.workspacePath('job-1', '../../../etc/passwd')).toBe('/workspaces/job-1/.._.._.._etc_passwd');
  });
});
