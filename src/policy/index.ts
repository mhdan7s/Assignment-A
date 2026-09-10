/**
 * Policy allowlist / risk classes / redaction — PLAN Phase 3 / AGENTS.md §4.4, §6.
 */
export type {
  PolicyConfig,
  PolicyContext,
  PolicyDecision,
  PolicyDenialCode,
} from "./types.js";

export {
  PolicyConfigSchema,
  PolicyDenialCodeSchema,
  PolicyViolationError,
} from "./types.js";

export { createBeforeActGuard, createPolicyEngine, type PolicyEngine } from "./engine.js";
export { demoCorePolicyConfig } from "./defaults.js";
export {
  REDACTED,
  isSensitiveKey,
  maskAccountLike,
  redactDeep,
  redactForArtifact,
  redactString,
} from "./redact.js";
