/**
 * Surface perception/action seam — PLAN Phase 2 / AGENTS.md §8.1.
 * Implementations must not leak Playwright types into artifacts.
 */
export type {
  ActionIntent,
  ActionResult,
  CheckpointResult,
  CheckpointSpec,
  EvidenceRefs,
  Observation,
  SurfaceDriver,
  WaitSpec,
} from "./types.js";

export { notImplemented } from "../shared/notImplemented.js";
