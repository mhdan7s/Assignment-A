import type { ActionIntent } from "../surface/types.js";
import { PolicyConfigSchema, PolicyViolationError, type PolicyConfig, type PolicyContext, type PolicyDecision } from "./types.js";

export type PolicyEngine = {
  readonly config: PolicyConfig;
  checkNavigation(url: string): PolicyDecision;
  checkAction(actionType: string, context?: PolicyContext): PolicyDecision;
  checkIntent(action: ActionIntent, context?: PolicyContext): PolicyDecision;
  /** Reset step/runtime budgets (call at start of a run). */
  resetBudget(): void;
  assertAllowed(action: ActionIntent, context?: PolicyContext): void;
};

class PolicyEngineImpl implements PolicyEngine {
  readonly config: PolicyConfig;
  private steps = 0;
  private startedAt = Date.now();

  constructor(config: PolicyConfig) {
    this.config = PolicyConfigSchema.parse(config);
  }

  resetBudget(): void {
    this.steps = 0;
    this.startedAt = Date.now();
  }

  checkNavigation(url: string): PolicyDecision {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        allow: false,
        code: "DENY_ORIGIN",
        reason: `Invalid navigation URL: ${url}`,
      };
    }

    const origin = parsed.origin;
    if (!this.config.allowedOrigins.includes(origin)) {
      return {
        allow: false,
        code: "DENY_ORIGIN",
        reason: `Origin not allowlisted: ${origin}`,
      };
    }

    const path = parsed.pathname || "/";
    const pathAllowed = this.config.allowedPathPrefixes.some((prefix) => {
      if (prefix === "/") return path === "/";
      return path === prefix || path.startsWith(`${prefix}/`);
    });

    if (!pathAllowed) {
      return {
        allow: false,
        code: "DENY_PATH",
        reason: `Path not allowlisted: ${path}`,
      };
    }

    return { allow: true };
  }

  checkAction(actionType: string, context: PolicyContext = {}): PolicyDecision {
    if (this.config.deniedActions.includes(actionType)) {
      return {
        allow: false,
        code: "DENY_ACTION",
        reason: `Action explicitly denied: ${actionType}`,
      };
    }

    if (!this.config.allowedActions.includes(actionType)) {
      // Irreversible ops may not be in allowedActions — still classify as risk/deny
      if (this.isRisky(actionType)) {
        return this.denyRisk(actionType, context);
      }
      return {
        allow: false,
        code: "DENY_ACTION",
        reason: `Action not allowlisted: ${actionType}`,
      };
    }

    if (this.isRisky(actionType)) {
      return this.denyRisk(actionType, context);
    }

    return { allow: true };
  }

  checkIntent(action: ActionIntent, context: PolicyContext = {}): PolicyDecision {
    this.steps += 1;
    if (this.steps > this.config.maxSteps) {
      return {
        allow: false,
        code: "DENY_BUDGET",
        reason: `Exceeded maxSteps (${this.config.maxSteps})`,
      };
    }
    if (Date.now() - this.startedAt > this.config.maxRuntimeMs) {
      return {
        allow: false,
        code: "DENY_BUDGET",
        reason: `Exceeded maxRuntimeMs (${this.config.maxRuntimeMs})`,
      };
    }

    if (action.type === "navigate") {
      const nav = this.checkNavigation(action.url);
      if (!nav.allow) return nav;
    }

    return this.checkAction(action.type, context);
  }

  assertAllowed(action: ActionIntent, context?: PolicyContext): void {
    const decision = this.checkIntent(action, context);
    if (!decision.allow) {
      throw new PolicyViolationError(decision);
    }
  }

  private isRisky(actionType: string): boolean {
    return (
      this.config.risk.irreversible.includes(actionType) ||
      this.config.risk.requiresHumanApproval.includes(actionType)
    );
  }

  private denyRisk(actionType: string, context: PolicyContext): PolicyDecision {
    if (context.approvedForUnattended) {
      // Still must be explicitly allowlisted to proceed when approved
      if (this.config.allowedActions.includes(actionType)) {
        return { allow: true };
      }
    }
    return {
      allow: false,
      code: "DENY_RISK",
      reason: `Risky/irreversible action blocked (fail-closed): ${actionType}. Requires HITL or approvedForUnattended + allowlist.`,
    };
  }
}

export function createPolicyEngine(config: PolicyConfig): PolicyEngine {
  return new PolicyEngineImpl(config);
}

/**
 * Surface `beforeAct` adapter — throws PolicyViolationError on deny.
 */
export function createBeforeActGuard(
  engine: PolicyEngine,
  context: PolicyContext = {},
): (action: ActionIntent) => void {
  return (action: ActionIntent) => {
    engine.assertAllowed(action, context);
  };
}
