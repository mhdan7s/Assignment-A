import type { ReplayResult } from "../errors/index.js";
import { notImplemented } from "../shared/notImplemented.js";

/**
 * Deterministic replay (production path) — PLAN Phase 6 / AGENTS.md §4.3.
 * Must not invoke the LLM for decisions in the default path.
 */
export type ReplayInput = {
  artifactPath: string;
  inputJson: string;
};

export async function runReplay(_input: ReplayInput): Promise<ReplayResult> {
  return notImplemented("replay.runReplay");
}

export { notImplemented };
