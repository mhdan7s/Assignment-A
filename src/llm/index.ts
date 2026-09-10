import { notImplemented } from "../shared/notImplemented.js";

/**
 * Gemini client + structured tool calling — PLAN Phase 4 / AGENTS.md §10.
 * Used by discovery only (not default replay).
 */
export type LlmClient = {
  model: string;
  completeStructured: (prompt: string) => Promise<unknown>;
};

export function createLlmClient(): LlmClient {
  return notImplemented("llm.createLlmClient");
}

export { notImplemented };
