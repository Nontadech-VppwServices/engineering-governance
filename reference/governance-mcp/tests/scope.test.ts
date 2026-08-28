import { describe, expect, it } from 'vitest';
import {
  assertImplementationWriteAllowed,
  assertRepositoryAllowed,
  assertSafeRepositoryPath,
  issueJobToken,
  validateScope,
  verifyJobToken,
} from '../src/scope.js';
import type { ExecutionScope } from '../src/types.js';

const SECRET = 'test-secret-value-at-least-32-characters';

function scope(overrides: Partial<ExecutionScope> = {}): ExecutionScope {
  return {
    schema_version: 1,
    job_id: 'job-1',
    jira_issue_key: 'RPA-100',
    execution_phase: 'implement',
    allowed_repositories: ['VespiarioThailand/rpa-ap-po-invoice'],
    working_branches: { 'VespiarioThailand/rpa-ap-po-invoice': 'ai/rpa-100-fix' },
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

describe('execution scope guard', () => {
  it('accepts a governed implementation scope', () => {
    expect(() => validateScope(scope())).not.toThrow();
  });

  it('blocks a repository outside Effective Context routing', () => {
    expect(() => assertRepositoryAllowed(scope(), 'VespiarioThailand/other-repo')).toThrow(/outside/);
  });

  it('blocks Git writes during analyze', () => {
    expect(() =>
      assertImplementationWriteAllowed(scope({ execution_phase: 'analyze' }), 'VespiarioThailand/rpa-ap-po-invoice'),
    ).toThrow(/forbidden/);
  });

  it('blocks Git writes during plan', () => {
    expect(() =>
      assertImplementationWriteAllowed(scope({ execution_phase: 'plan' }), 'VespiarioThailand/rpa-ap-po-invoice'),
    ).toThrow(/forbidden/);
  });

  it('uses only the approved working branch', () => {
    expect(assertImplementationWriteAllowed(scope(), 'VespiarioThailand/rpa-ap-po-invoice')).toBe('ai/rpa-100-fix');
  });

  it('rejects repository path traversal', () => {
    expect(() => assertSafeRepositoryPath('../secrets.txt')).toThrow(/escapes/);
    expect(() => assertSafeRepositoryPath('src/../../secrets.txt')).toThrow(/escapes/);
    expect(() => assertSafeRepositoryPath('/etc/passwd')).toThrow(/escapes/);
    expect(() => assertSafeRepositoryPath('src/index.ts')).not.toThrow();
  });

  it('hard-blocks merge authority', () => {
    const invalid = scope();
    invalid.permissions = { ...invalid.permissions, can_merge: true as false };
    expect(() => validateScope(invalid)).toThrow(/merge authority/);
  });

  it('hard-blocks production deploy and credential authority', () => {
    const deploy = scope();
    deploy.permissions = { ...deploy.permissions, can_deploy_production: true as false };
    expect(() => validateScope(deploy)).toThrow(/production deployment authority/);

    const creds = scope();
    creds.permissions = { ...creds.permissions, can_access_production_credentials: true as false };
    expect(() => validateScope(creds)).toThrow(/production credential access/);
  });

  it('rejects a malformed Jira issue key', () => {
    expect(() => validateScope(scope({ jira_issue_key: 'not-a-key' }))).toThrow(/Jira issue key/);
  });
});

describe('job token', () => {
  it('round-trips a scope', () => {
    const token = issueJobToken(scope(), SECRET);
    expect(verifyJobToken(token, SECRET)).toEqual(scope());
  });

  it('rejects a token signed with another secret', () => {
    const token = issueJobToken(scope(), SECRET);
    expect(() => verifyJobToken(token, 'a-different-secret-value-32-chars!!')).toThrow(/signature/);
  });

  // The whole point of the signed token: Hermes holds it but cannot widen it.
  it('rejects a payload edited to widen the repository allowlist', () => {
    const token = issueJobToken(scope(), SECRET);
    const [, signature] = token.split('.');
    const forged = { ...scope(), allowed_repositories: ['VespiarioThailand/anything-else'] };
    const payload = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect(() => verifyJobToken(`${payload}.${signature}`, SECRET)).toThrow(/signature/);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyJobToken('garbage', SECRET)).toThrow(/Invalid job token/);
    expect(() => verifyJobToken('', SECRET)).toThrow(/Invalid job token/);
  });

  it('refuses to mint a token for a scope granting merge', () => {
    const invalid = scope();
    invalid.permissions = { ...invalid.permissions, can_merge: true as false };
    expect(() => issueJobToken(invalid, SECRET)).toThrow(/merge authority/);
  });
});
