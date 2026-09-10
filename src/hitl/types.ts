/**
 * HITL types — PLAN Phase 9 / AGENTS.md §4.6, §11.
 */

export type ControlOwner = "automation" | "human" | "transferring";

export type InterventionReason =
  | "stuck_discovery"
  | "unrecoverable_replay"
  | "risky_action"
  | "policy";

export type InterventionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  reason: InterventionReason;
  capabilityOrGoal: string;
  stepId?: string;
  observationSummary: string;
  screenshotRef?: string;
  instructionsForHuman: string;
  createdAt: string;
  status: "open" | "resumed" | "aborted";
  humanActions: HumanActionRecord[];
  resolvedAt?: string;
  resolveNote?: string;
};

export type HumanActionRecord = {
  at: string;
  kind: "click" | "keydown" | "navigation" | "note";
  detail: string;
};

export type HitlResolveSignal = {
  action: "resume" | "abort";
  note?: string;
};
