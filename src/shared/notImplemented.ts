/**
 * Shared helper for Phase 1 module stubs.
 * Real implementations replace these call sites in later PLAN phases.
 */
export function notImplemented(name: string): never {
  throw new Error(
    `[not-implemented] ${name} — see PLAN.md / PHASE_0_1_IMPLEMENTATION.md`,
  );
}
