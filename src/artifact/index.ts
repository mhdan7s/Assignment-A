import { CapabilityArtifactSchema } from "./schema.js";
import { notImplemented } from "../shared/notImplemented.js";

/**
 * Capability artifact load/save/validate — PLAN Phase 5 / AGENTS.md §4.2.
 * Decoupled from raw model transcripts.
 */
export { CapabilityArtifactSchema, type CapabilityArtifact } from "./schema.js";

export function loadArtifact(_path: string): unknown {
  return notImplemented("artifact.loadArtifact");
}

export function saveArtifact(_path: string, _artifact: unknown): void {
  return notImplemented("artifact.saveArtifact");
}

export function validateArtifact(data: unknown) {
  return CapabilityArtifactSchema.safeParse(data);
}
