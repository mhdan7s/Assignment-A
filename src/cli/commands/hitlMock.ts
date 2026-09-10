import type { Command } from "commander";
import { logger } from "../../shared/logger.js";

const EXIT_NOT_IMPLEMENTED = 2;

/**
 * HITL mock CLI stub — real same-session handoff in PLAN Phase 9.
 */
export function registerHitlMockCommand(program: Command): void {
  program
    .command("hitl-mock")
    .description("Mock operator handoff against a live session (stub in Phase 1)")
    .requiredOption("--run <runId>", "Run id to attach / resume")
    .action((opts: { run: string }) => {
      logger.warn(
        {
          command: "hitl-mock",
          runId: opts.run,
          phase: 9,
        },
        "[not-implemented] hitl-mock — same-session control transfer lands in PLAN Phase 9",
      );
      process.exitCode = EXIT_NOT_IMPLEMENTED;
    });
}
