import { notImplemented } from "../shared/notImplemented.js";

/**
 * LLM-driven discovery agent loop — PLAN Phase 4 / AGENTS.md §4.1.
 * Model discovers; does not become the production capability.
 */
export type DiscoveryInput = {
  goal: string;
  targetUrl: string;
  outPath?: string;
  maxSteps?: number;
};

export type DiscoveryResult = {
  runId: string;
  artifactPath: string;
  evidenceDir: string;
};

export async function runDiscovery(_input: DiscoveryInput): Promise<DiscoveryResult> {
  return notImplemented("agent.runDiscovery");
}

export { notImplemented };
