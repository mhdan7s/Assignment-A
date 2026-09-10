import type { Command } from "commander";
import { runReplay } from "../../replay/index.js";
import { logger } from "../../shared/logger.js";

/**
 * Replay CLI — PLAN Phase 6 (no LLM).
 */
export function registerReplayCommand(program: Command): void {
  program
    .command("replay")
    .description("Deterministically replay a capability artifact")
    .requiredOption("--artifact <path>", "Path to capability artifact JSON")
    .requiredOption("--input <json>", "JSON object of typed input parameters")
    .option("--headed", "Run browser headed", false)
    .action(async (opts: { artifact: string; input: string; headed?: boolean }) => {
      try {
        JSON.parse(opts.input);
      } catch {
        logger.error({ input: opts.input }, "Invalid --input JSON");
        process.exitCode = 1;
        return;
      }

      try {
        const result = await runReplay({
          artifactPath: opts.artifact,
          inputJson: opts.input,
          headless: !opts.headed,
        });
        logger.info({ result }, "replay finished");
        if (result.status === "success") process.exitCode = 0;
        else if (result.status === "business_outcome") process.exitCode = 0;
        else process.exitCode = 1;
      } catch (err) {
        logger.error({ err }, "replay failed");
        process.exitCode = 1;
      }
    });
}
