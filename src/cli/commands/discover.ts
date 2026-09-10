import type { Command } from "commander";
import { logger } from "../../shared/logger.js";

const EXIT_NOT_IMPLEMENTED = 2;

/**
 * Discovery CLI stub — real loop in PLAN Phase 4.
 */
export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Run LLM-driven discovery against a live target (stub in Phase 1)")
    .requiredOption("--goal <goal>", "Natural-language goal to accomplish")
    .requiredOption("--target <url>", "Target application entry URL")
    .option("--out <path>", "Output path for the capability artifact")
    .action((opts: { goal: string; target: string; out?: string }) => {
      logger.warn(
        {
          command: "discover",
          goal: opts.goal,
          target: opts.target,
          out: opts.out ?? null,
          phase: 4,
        },
        "[not-implemented] discover — LLM observe→decide→act lands in PLAN Phase 4",
      );
      process.exitCode = EXIT_NOT_IMPLEMENTED;
    });
}
