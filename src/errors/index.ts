/**
 * Outcome taxonomy — PLAN Phase 7 / AGENTS.md §5.
 * Never conflate business outcomes with hard failures.
 */

export type BusinessOutcomeCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | string;

export type ReplayResult =
  | {
      status: "success";
      outputs: Record<string, unknown>;
    }
  | {
      status: "business_outcome";
      code: BusinessOutcomeCode;
      message: string;
      outputs?: Record<string, unknown>;
    }
  | {
      status: "failed";
      error: {
        stepId?: string;
        expected: string;
        observed: string;
        category: "hard_failure" | "policy_violation" | "timeout" | string;
      };
    }
  | {
      status: "needs_human";
      interventionId: string;
      reason: string;
    };
