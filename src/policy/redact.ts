/**
 * Redaction helpers — AGENTS.md §6 / PLAN Phase 3.
 * Never persist secrets or raw sensitive financial identifiers.
 */

const SENSITIVE_KEY =
  /^(password|passwd|token|access_token|refresh_token|authorization|cookie|ssn|pan|secret|api[_-]?key|session)$/i;

const SENSITIVE_PATH_FRAGMENT =
  /(password|token|authorization|cookie|ssn|pan|secret|api[_-]?key)/i;

export const REDACTED = "[REDACTED]";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_PATH_FRAGMENT.test(key);
}

/** Keep last 4 digits of account-like numbers; redact otherwise. */
export function maskAccountLike(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 19) {
    return `****${digits.slice(-4)}`;
  }
  return value;
}

export function redactString(value: string): string {
  // crude credential patterns
  let out = value.replace(
    /(password|token|authorization)\s*[:=]\s*\S+/gi,
    (_m, k: string) => `${k}=${REDACTED}`,
  );
  out = out.replace(/\b\d{12,19}\b/g, (m) => maskAccountLike(m));
  return out;
}

/**
 * Deep-redact plain objects/arrays for logs and artifact emission.
 * Does not mutate the input.
 */
export function redactDeep<T>(input: T): T {
  return redactDeepInner(input, "") as T;
}

function redactDeepInner(input: unknown, path: string): unknown {
  if (input === null || input === undefined) return input;

  if (typeof input === "string") {
    if (SENSITIVE_PATH_FRAGMENT.test(path)) return REDACTED;
    return redactString(input);
  }

  if (typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item, i) => redactDeepInner(item, `${path}[${i}]`));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else if (typeof value === "string" && /account|memberId|member_id/i.test(key)) {
      // member IDs in demo are short synthetic ids — keep; long account numbers mask
      out[key] = value.length >= 8 ? maskAccountLike(value) : value;
    } else {
      out[key] = redactDeepInner(value, nextPath);
    }
  }
  return out;
}

/** Alias for artifact emission gate. */
export function redactForArtifact<T>(input: T): T {
  return redactDeep(input);
}
