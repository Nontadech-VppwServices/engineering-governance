import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Identity, LinePrincipal, Role } from './types.js';

const VALID_ROLES = new Set<Role>(['viewer', 'requester', 'approver', 'deployer', 'admin']);

export function parseIdentities(raw: string): Map<string, Identity> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('LINE_IDENTITIES_JSON must be valid JSON.'); }
  if (!Array.isArray(value)) throw new Error('LINE_IDENTITIES_JSON must be an array.');
  const result = new Map<string, Identity>();
  for (const item of value) {
    const identity = item as Partial<Identity>;
    if (!identity.line_user_id?.startsWith('U') || !identity.jira_account_id?.trim() || !identity.github_login?.trim() || !Array.isArray(identity.roles) || !identity.roles.every((role) => VALID_ROLES.has(role))) throw new Error('LINE identity entry is invalid.');
    if (result.has(identity.line_user_id)) throw new Error(`Duplicate LINE identity: ${identity.line_user_id}`);
    result.set(identity.line_user_id, identity as Identity);
  }
  return result;
}

export function issuePrincipal(identity: Identity, secret: string, directMessage: boolean, ttlSeconds = 300): string {
  const now = Date.now();
  const principal: LinePrincipal = { ...identity, source_type: directMessage ? 'user' : 'group', direct_message: directMessage, issued_at: new Date(now).toISOString(), expires_at: new Date(now + ttlSeconds * 1000).toISOString() };
  const payload = Buffer.from(JSON.stringify(principal)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyPrincipal(token: string, secret: string): LinePrincipal {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new Error('Invalid principal token.');
  const expected = sign(payload, secret);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid principal signature.');
  const principal = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LinePrincipal;
  if (Date.parse(principal.expires_at) <= Date.now()) throw new Error('Principal token expired.');
  return principal;
}

export function hasRole(principal: LinePrincipal, role: Role): boolean { return principal.roles.includes('admin') || principal.roles.includes(role); }
function sign(payload: string, secret: string): string { return createHmac('sha256', secret).update(payload).digest('base64url'); }
