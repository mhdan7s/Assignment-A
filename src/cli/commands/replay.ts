import type { Command } from "commander";
import { logger } from "../../shared/logger.js";

const EXIT_NOT_IMPLEMENTED = 2;

/**
 * Replay CLI stub — real executor in PLAN Phase 6.
 */
export function registerReplayCommand(program: Command): void {
  program
    .command("replay")
    .description("Deterministically replay a capability artifact (stub in Phase 1)")
    .requiredOption("--artifact <path>", "Path to capability artifact JSON")
    .requiredOption("--input <json>", "JSON object of typed input parameters")
    .action((opts: { artifact: string; input: string }) => {
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(opts.input);
      } catch {
        logger.error({ input: opts.input }, "Invalid --input JSON");
        process.exitCode = 1;
        return;
      }

      logger.warn(
        {
          command: "replay",
          artifact: opts.artifact,
          input: parsedInput,
          phase: 6,
        },
        "[not-implemented] replay — deterministic executor lands in PLAN Phase 6",
      );
      process.exitCode = EXIT_NOT_IMPLEMENTED;
    });
}
