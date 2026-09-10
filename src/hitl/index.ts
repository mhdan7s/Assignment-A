/**
 * Human-in-the-loop control transfer — PLAN Phase 9 / AGENTS.md §4.6, §11.
 * Same live session only; operator UI is a minimal mock signal surface.
 */

export type {
  ControlOwner,
  HitlResolveSignal,
  HumanActionRecord,
  InterventionReason,
  InterventionRequest,
} from "./types.js";

export { HitlController, type HitlControllerOptions } from "./controller.js";
export { startOperatorServer, type OperatorServer } from "./operatorServer.js";
export { runHitlDemo, type HitlDemoResult } from "./demo.js";
