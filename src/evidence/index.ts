import { notImplemented } from "../shared/notImplemented.js";

/**
 * Evidence bundles under /evidence/<runId>/ — PLAN Phase 8 / AGENTS.md §12.
 */
export type EvidenceRunMeta = {
  runId: string;
  mode: "discover" | "replay" | "hitl";
  startedAt: string;
};

export function createEvidenceRun(_meta: EvidenceRunMeta): string {
  return notImplemented("evidence.createEvidenceRun");
}

export { notImplemented };
