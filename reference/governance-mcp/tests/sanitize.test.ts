import { describe, expect, it } from 'vitest';
import { assertNoSecret, safe, sanitize } from '../src/sanitize.js';

describe('redaction', () => {
  it('redacts bearer tokens and inline credentials', () => {
    expect(safe('authorization: Bearer abc123def')).toContain('<redacted>');
    expect(safe('password=hunter2')).toContain('<redacted>');
    expect(safe('token: sk-live-9999')).toContain('<redacted>');
  });

  it('leaves ordinary text intact', () => {
    expect(safe('quality gate typecheck passed')).toBe('quality gate typecheck passed');
  });

  it('drops secret-bearing keys from persisted structures', () => {
    const value = sanitize({ ok: true, password: 'hunter2', nested: { api_key: 'x', keep: 'yes' } });
    expect(value).toEqual({ ok: true, nested: { keep: 'yes' } });
  });

  it('caps very long values', () => {
    expect(safe('x'.repeat(9000)).length).toBe(4000);
  });

  it('rejects content carrying a credential', () => {
    expect(() => assertNoSecret('here is my token=abc')).toThrow(/credential/);
    expect(() => assertNoSecret('a normal Jira comment')).not.toThrow();
  });
});
