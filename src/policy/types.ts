import { z } from "zod";

export const PolicyDenialCodeSchema = z.enum([
  "DENY_ORIGIN",
  "DENY_PATH",
  "DENY_ACTION",
  "DENY_RISK",
  "DENY_BUDGET",
]);

export type PolicyDenialCode = z.infer<typeof PolicyDenialCodeSchema>;

export const PolicyConfigSchema = z.object({
  name: z.string().default("default"),
  allowedOrigins: z.array(z.string().url()).min(1),
  allowedPathPrefixes: z.array(z.string()).default(["/"]),
  allowedActions: z.array(z.string()).min(1),
  deniedActions: z.array(z.string()).default([]),
  maxSteps: z.number().int().positive().default(40),
  maxRuntimeMs: z.number().int().positive().default(180_000),
  risk: z.object({
    irreversible: z.array(z.string()).default([]),
    requiresHumanApproval: z.array(z.string()).default([]),
    safeReversible: z.array(z.string()).default([]),
  }),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: string; code: PolicyDenialCode };

export type PolicyContext = {
  /** Capability/run approved for unattended irreversible actions */
  approvedForUnattended?: boolean;
  mode?: "discovery" | "replay" | "manual";
};

export class PolicyViolationError extends Error {
  readonly code: PolicyDenialCode;
  readonly decision: Extract<PolicyDecision, { allow: false }>;

  constructor(decision: Extract<PolicyDecision, { allow: false }>) {
    super(`[policy:${decision.code}] ${decision.reason}`);
    this.name = "PolicyViolationError";
    this.code = decision.code;
    this.decision = decision;
  }
}
