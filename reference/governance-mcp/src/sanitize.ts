// Deterministic redaction. Applied to every tool result before it reaches
// Hermes and to every value before it is persisted. A prompt instruction not to
// leak secrets is not an enforcement mechanism; this is.

const SECRET_KEY = /(password|token|cookie|secret|stack|screenshot|authorization|api[_-]?key|private[_-]?key)/i;
const SECRET_VALUE = /(bearer\s+|token[=:]\s*|password[=:]\s*|secret[=:]\s*|api[_-]?key[=:]\s*)[^\s'"]+/gi;

export function safe(value: string): string {
  return value.replace(SECRET_VALUE, '$1<redacted>').slice(0, 4000);
}

export function sanitize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item) =>
      SECRET_KEY.test(key) ? undefined : typeof item === 'string' ? safe(item) : item,
    ),
  );
}

const CREDENTIAL_IN_TEXT = /(authorization\s*:\s*bearer|password\s*[=:]|secret\s*[=:]|token\s*[=:])/i;

export function assertNoSecret(text: string): void {
  if (CREDENTIAL_IN_TEXT.test(text)) {
    throw new Error('Content appears to contain a credential or secret.');
  }
}
