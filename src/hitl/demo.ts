import { createEvidenceRun } from "../evidence/index.js";
import {
  createBeforeActGuard,
  createPolicyEngine,
  demoCorePolicyConfig,
} from "../policy/index.js";
import { env } from "../shared/env.js";
import { PlaywrightWebDriver } from "../surface/playwrightWebDriver.js";
import { HitlController } from "./controller.js";
import type { InterventionRequest } from "./types.js";

export type HitlDemoResult = {
  success: boolean;
  sessionId: string;
  sessionIdAfterResume: string;
  sameSession: boolean;
  intervention: InterventionRequest;
  evidenceDir: string;
  operatorUrl: string;
  finalUrl: string;
  message: string;
};

/**
 * End-to-end HITL demo against demo-core:
 * automation opens login → escalates (forced stuck) → human/API resumes same session →
 * automation continues login.
 */
export async function runHitlDemo(options?: {
  headless?: boolean;
  /** When set, auto-POST resume after operator server is up (CI/tests). */
  autoResumeMs?: number;
  operatorPort?: number;
  targetOrigin?: string;
}): Promise<HitlDemoResult> {
  const origin = options?.targetOrigin ?? env.DEMO_CORE_ORIGIN;
  const operatorPort = options?.operatorPort ?? 4174;
  const evidence = createEvidenceRun({ mode: "hitl" });
  const policy = createPolicyEngine(demoCorePolicyConfig(origin));
  policy.resetBudget();

  const driver = await PlaywrightWebDriver.create({
    headless: options?.headless ?? false,
    beforeAct: createBeforeActGuard(policy, { mode: "manual" }),
    evidenceDir: evidence.screenshotDir,
  });

  const sessionId = driver.sessionId;
  evidence.writeMeta({
    mode: "hitl",
    sessionId,
    startedAt: new Date().toISOString(),
    target: origin,
  });

  const hitl = new HitlController({
    runId: evidence.runId,
    driver,
    evidence,
    operatorPort,
    timeoutMs: (options?.autoResumeMs ?? 0) + 30_000,
  });

  const operatorUrl = `http://127.0.0.1:${operatorPort}/`;

  try {
    driver.registerTargets([
      {
        id: "username",
        strategies: [
          { kind: "a11y", role: "textbox", name: "Username" },
          { kind: "label", text: "Username" },
        ],
      },
      {
        id: "password",
        strategies: [
          { kind: "a11y", role: "textbox", name: "Password" },
          { kind: "label", text: "Password" },
        ],
      },
      {
        id: "sign_in",
        strategies: [{ kind: "a11y", role: "button", name: "Sign in" }],
      },
    ]);

    await driver.act({ type: "navigate", url: `${origin}/login` });
    evidence.append({ type: "demo_nav_login", sessionId });

    const { intervention, resumed } = await hitl.escalate({
      reason: "stuck_discovery",
      capabilityOrGoal: "HITL demo: continue staff login after human assist",
      stepId: "before_credentials",
      instructionsForHuman:
        "Use the live browser window (same session). Optionally click around, then press Resume so automation can type credentials.",
      ...(options?.autoResumeMs !== undefined ? { autoResumeMs: options.autoResumeMs } : {}),
    });

    const sessionIdAfterResume = driver.sessionId;

    if (!resumed) {
      const result: HitlDemoResult = {
        success: false,
        sessionId,
        sessionIdAfterResume,
        sameSession: sessionId === sessionIdAfterResume,
        intervention,
        evidenceDir: evidence.dir,
        operatorUrl,
        finalUrl: driver.getPage().url(),
        message: "Operator aborted the run",
      };
      evidence.writeResult(result);
      return result;
    }

    await driver.act({ type: "type", targetRef: "username", text: "teller" });
    await driver.act({
      type: "type",
      targetRef: "password",
      text: env.DEMO_CORE_PASSWORD,
    });
    await driver.act({ type: "click", targetRef: "sign_in" });
    await driver.waitFor({ kind: "url", pattern: "/home", timeoutMs: 10_000 });

    const finalUrl = driver.getPage().url();
    const result: HitlDemoResult = {
      success: true,
      sessionId,
      sessionIdAfterResume,
      sameSession: sessionId === sessionIdAfterResume,
      intervention,
      evidenceDir: evidence.dir,
      operatorUrl,
      finalUrl,
      message: "HITL handoff completed; automation finished login on same session",
    };
    evidence.writeResult(result);
    evidence.append({ type: "demo_complete", finalUrl, sameSession: result.sameSession });
    return result;
  } finally {
    await hitl.dispose();
    await driver.dispose();
  }
}
