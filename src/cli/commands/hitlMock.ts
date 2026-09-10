import type { Command } from "commander";
import { runHitlDemo } from "../../hitl/index.js";
import { logger } from "../../shared/logger.js";

/**
 * HITL demo — PLAN Phase 9.
 * Forces an intervention, opens mock operator UI, resumes the same Playwright session.
 */
export function registerHitlMockCommand(program: Command): void {
  program
    .command("hitl-mock")
    .description("Demo same-session human handoff with mock operator console")
    .option("--run <runId>", "Optional label (stored in evidence meta)")
    .option("--headed", "Show the live browser (default true for demo)", true)
    .option("--headless", "Run browser headless (CI)", false)
    .option("--auto-resume-ms <n>", "Auto-click Resume after N ms (tests/CI)", (v) => Number(v))
    .option("--operator-port <n>", "Operator console port", (v) => Number(v), 4174)
    .action(
      async (opts: {
        run?: string;
        headed?: boolean;
        headless?: boolean;
        autoResumeMs?: number;
        operatorPort: number;
      }) => {
        try {
          const result = await runHitlDemo({
            headless: opts.headless ? true : !opts.headed,
            operatorPort: opts.operatorPort,
            ...(opts.autoResumeMs !== undefined ? { autoResumeMs: opts.autoResumeMs } : {}),
          });
          logger.info(
            {
              label: opts.run ?? null,
              ...result,
              interventionId: result.intervention.id,
            },
            "hitl-mock finished",
          );
          process.exitCode = result.success && result.sameSession ? 0 : 1;
        } catch (err) {
          logger.error({ err }, "hitl-mock failed");
          process.exitCode = 1;
        }
      },
    );
}
