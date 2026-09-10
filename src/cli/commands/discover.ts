import type { Command } from "commander";
import { runDiscovery } from "../../agent/index.js";
import { logger } from "../../shared/logger.js";
import { requireGeminiApiKey } from "../../shared/env.js";

/**
 * Discovery CLI — PLAN Phase 4.
 */
export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Run LLM-driven discovery against a live target")
    .requiredOption("--goal <goal>", "Natural-language goal to accomplish")
    .requiredOption("--target <url>", "Target application entry URL")
    .option("--out <path>", "Output path for the capability artifact")
    .option("--max-steps <n>", "Max agent steps", (v) => Number(v), 25)
    .option("--headed", "Run browser headed", false)
    .action(async (opts: {
      goal: string;
      target: string;
      out?: string;
      maxSteps: number;
      headed?: boolean;
    }) => {
      try {
        requireGeminiApiKey();
        const result = await runDiscovery({
          goal: opts.goal,
          targetUrl: opts.target,
          ...(opts.out ? { outPath: opts.out } : {}),
          maxSteps: opts.maxSteps,
          headless: !opts.headed,
        });
        if (result.success) {
          logger.info(result, "discovery completed");
          process.exitCode = 0;
        } else {
          logger.error(result, "discovery did not complete");
          process.exitCode = 1;
        }
      } catch (err) {
        logger.error({ err }, "discovery failed");
        process.exitCode = 1;
      }
    });
}
