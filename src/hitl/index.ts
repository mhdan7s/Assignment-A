import { notImplemented } from "../shared/notImplemented.js";

/**
 * Human-in-the-loop control transfer — PLAN Phase 9 / AGENTS.md §4.6, §11.
 * Same live session only; operator UI may be mocked.
 */

export enum ControlOwner {
  Automation = "automation",
  Human = "human",
  Transferring = "transferring",
}

export type InterventionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  reason: "stuck_discovery" | "unrecoverable_replay" | "risky_action" | "policy";
  stepId?: string;
  message: string;
  createdAt: string;
};

export async function requestIntervention(
  _req: Omit<InterventionRequest, "id" | "createdAt">,
): Promise<InterventionRequest> {
  return notImplemented("hitl.requestIntervention");
}

export { notImplemented };
