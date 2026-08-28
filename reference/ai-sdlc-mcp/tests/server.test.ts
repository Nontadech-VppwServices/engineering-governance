import { describe, expect, it } from 'vitest';
import {
  assertImplementationWriteAllowed,
  assertRepositoryAllowed,
  assertSafeRepositoryPath,
  validateScope,
} from '../src/server.js';
import type { ExecutionScope } from '../src/types.js';

function scope(overrides: Partial<ExecutionScope> = {}): ExecutionScope {
  return {
    schema_version: 1,
    job_id: 'job-1',
    jira_issue_key: 'RPA-100',
    execution_phase: 'implement',
    allowed_repositories: ['VespiarioThailand/rpa-ap-po-invoice'],
    working_branches: {
      'VespiarioThailand/rpa-ap-po-invoice': 'ai/rpa-100-fix',
    },
    permissions: {
      can_modify_code: true,
      can_create_pr: true,
      can_merge: false,
      can_deploy_production: false,
      can_access_production_credentials: false,
    },
    ...overrides,
  };
}

describe('AI SDLC MCP scope guard', () => {
  it('accepts a governed implementation scope', () => {
    expect(() => validateScope(scope())).not.toThrow();
  });

  it('blocks a repository outside Effective Context routing', () => {
    expect(() => assertRepositoryAllowed(scope(), 'VespiarioThailand/other-repo')).toThrow(/outside/);
  });

  it('blocks Git writes during analyze', () => {
    expect(() => assertImplementationWriteAllowed(scope({ execution_phase: 'analyze' }), 'VespiarioThailand/rpa-ap-po-invoice')).toThrow(/forbidden/);
  });

  it('uses only the approved working branch', () => {
    expect(assertImplementationWriteAllowed(scope(), 'VespiarioThailand/rpa-ap-po-invoice')).toBe('ai/rpa-100-fix');
  });

  it('rejects repository path traversal', () => {
    expect(() => assertSafeRepositoryPath('../secrets.txt')).toThrow(/escapes/);
    expect(() => assertSafeRepositoryPath('src/../../secrets.txt')).toThrow(/escapes/);
  });

  it('hard-blocks production and merge authority', () => {
    const invalid = scope();
    invalid.permissions = {
      ...invalid.permissions,
      can_merge: true as false,
    };
    expect(() => validateScope(invalid)).toThrow(/merge authority/);
  });
});
