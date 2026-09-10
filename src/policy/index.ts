import { notImplemented } from "../shared/notImplemented.js";

/**
 * Policy allowlist / risk classes / redaction — PLAN Phase 3 / AGENTS.md §4.4, §6.
 */
export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: string; code: "DENY_ORIGIN" | "DENY_ACTION" | "DENY_RISK" };

export type PolicyEngine = {
  checkNavigation(url: string): PolicyDecision;
  checkAction(actionType: string): PolicyDecision;
};

export function createPolicyEngine(): PolicyEngine {
  return notImplemented("policy.createPolicyEngine");
}

export { notImplemented };
