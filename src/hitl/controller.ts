import { randomUUID } from "node:crypto";
import type { EvidenceRun } from "../evidence/index.js";
import type { PlaywrightWebDriver } from "../surface/playwrightWebDriver.js";
import { logger } from "../shared/logger.js";
import { startOperatorServer, type OperatorServer } from "./operatorServer.js";
import type {
  ControlOwner,
  HumanActionRecord,
  InterventionReason,
  InterventionRequest,
} from "./types.js";

export type HitlControllerOptions = {
  runId: string;
  driver: PlaywrightWebDriver;
  evidence?: EvidenceRun;
  operatorPort?: number;
  /** Max time to wait for operator resume/abort */
  timeoutMs?: number;
};

/**
 * Same-session HITL control transfer.
 * Does not open a new browser — pauses the existing Playwright session.
 */
export class HitlController {
  private readonly runId: string;
  private readonly driver: PlaywrightWebDriver;
  private readonly evidence: EvidenceRun | undefined;
  private readonly operatorPort: number | undefined;
  private readonly timeoutMs: number;
  private operator: OperatorServer | null = null;
  private unhookHumanActions: (() => void) | null = null;
  activeIntervention: InterventionRequest | null = null;

  constructor(opts: HitlControllerOptions) {
    this.runId = opts.runId;
    this.driver = opts.driver;
    this.evidence = opts.evidence;
    this.operatorPort = opts.operatorPort;
    this.timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  }

  get owner(): ControlOwner {
    return this.driver.owner;
  }

  get sessionId(): string {
    return this.driver.sessionId;
  }

  /**
   * Detect stuck → create InterventionRequest → pause surface → open operator UI →
   * wait for resume/abort → resume same session (or abort).
   */
  async escalate(input: {
    reason: InterventionReason;
    capabilityOrGoal: string;
    stepId?: string;
    instructionsForHuman?: string;
    /** For CI: POST /api/resume automatically after server is up */
    autoResumeMs?: number;
  }): Promise<{ intervention: InterventionRequest; resumed: boolean }> {
    const obs = await this.driver.observe({ screenshot: false });
    const evidenceCapture = await this.driver.captureEvidence(
      `hitl-${input.reason}`,
      this.evidence?.screenshotDir,
    );

    const intervention: InterventionRequest = {
      id: `int_${randomUUID().slice(0, 8)}`,
      runId: this.runId,
      sessionId: this.driver.sessionId,
      reason: input.reason,
      capabilityOrGoal: input.capabilityOrGoal,
      observationSummary: `URL: ${obs.url}\nTitle: ${obs.title}\n${(obs.ariaSnapshot ?? "").slice(0, 1500)}`,
      instructionsForHuman:
        input.instructionsForHuman ??
        "Use the live headed browser (same session). Fix the page state, then click Resume.",
      createdAt: new Date().toISOString(),
      status: "open",
      humanActions: [],
    };
    if (input.stepId !== undefined) intervention.stepId = input.stepId;
    if (evidenceCapture.screenshotPath !== undefined) {
      intervention.screenshotRef = evidenceCapture.screenshotPath;
    }

    this.activeIntervention = intervention;
    this.evidence?.append({
      type: "hitl_escalate",
      interventionId: intervention.id,
      sessionId: intervention.sessionId,
      reason: intervention.reason,
      owner: "transferring",
    });

    await this.driver.pauseForHuman();
    this.evidence?.append({
      type: "hitl_owner",
      owner: "human",
      sessionId: this.driver.sessionId,
    });

    this.unhookHumanActions = await this.driver.beginHumanActionCapture((action) => {
      intervention.humanActions.push(action);
      this.evidence?.append({ type: "hitl_human_action", ...action });
    });

    this.operator = await startOperatorServer({
      intervention,
      ...(this.operatorPort !== undefined ? { port: this.operatorPort } : {}),
      ...(intervention.screenshotRef !== undefined
        ? { screenshotPath: intervention.screenshotRef }
        : {}),
    });

    logger.info(
      {
        operatorUrl: this.operator.url,
        sessionId: this.driver.sessionId,
        interventionId: intervention.id,
      },
      "waiting for human operator",
    );

    if (input.autoResumeMs !== undefined) {
      const url = `${this.operator.url.replace(/\/$/, "")}/api/resume`;
      const delay = input.autoResumeMs;
      setTimeout(() => {
        void fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "auto-resume" }),
        }).catch((err) => logger.warn({ err }, "auto-resume failed"));
      }, delay);
    }

    try {
      const signal = await this.operator.waitForSignal(this.timeoutMs);
      intervention.resolvedAt = new Date().toISOString();
      if (signal.note !== undefined) intervention.resolveNote = signal.note;

      this.unhookHumanActions?.();
      this.unhookHumanActions = null;

      if (signal.action === "abort") {
        intervention.status = "aborted";
        this.evidence?.append({
          type: "hitl_abort",
          interventionId: intervention.id,
          sessionId: this.driver.sessionId,
          note: signal.note,
        });
        // Leave owner as human until dispose; caller should stop the run.
        return { intervention, resumed: false };
      }

      intervention.status = "resumed";
      await this.driver.resumeFromHuman();
      this.evidence?.append({
        type: "hitl_resume",
        interventionId: intervention.id,
        sessionId: this.driver.sessionId,
        owner: "automation",
        note: signal.note,
        humanActionCount: intervention.humanActions.length,
      });
      return { intervention, resumed: true };
    } finally {
      await this.operator.close().catch(() => undefined);
      this.operator = null;
    }
  }

  async dispose(): Promise<void> {
    this.unhookHumanActions?.();
    this.unhookHumanActions = null;
    if (this.operator) {
      await this.operator.close().catch(() => undefined);
      this.operator = null;
    }
  }
}

export type { HumanActionRecord };
