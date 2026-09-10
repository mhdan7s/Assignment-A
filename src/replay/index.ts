import path from "node:path";
import {
  loadArtifact,
  resolveBinding,
  type CapabilityArtifact,
  type CapabilityStep,
} from "../artifact/index.js";
import type { ReplayResult } from "../errors/index.js";
import { createEvidenceRun } from "../evidence/index.js";
import {
  createBeforeActGuard,
  createPolicyEngine,
  demoCorePolicyConfig,
} from "../policy/index.js";
import { PlaywrightWebDriver } from "../surface/playwrightWebDriver.js";
import type { ActionIntent, CheckpointSpec, MultiStrategyLocator } from "../surface/types.js";
import { matchOutcome, matchRecovery } from "./detect.js";
import { logger } from "../shared/logger.js";

export type ReplayInput = {
  artifactPath: string;
  inputJson: string;
  headless?: boolean;
  evidenceBaseDir?: string;
};

function toCheckpointSpec(cp: {
  description: string;
  urlPattern?: string | undefined;
  a11yIncludes?: Array<{ role?: string | undefined; name: string }> | undefined;
}): CheckpointSpec {
  const out: CheckpointSpec = { description: cp.description };
  if (cp.urlPattern !== undefined) out.urlPattern = cp.urlPattern;
  if (cp.a11yIncludes !== undefined) {
    out.a11yIncludes = cp.a11yIncludes.map((item) => {
      const mapped: { name: string; role?: string } = { name: item.name };
      if (item.role !== undefined) mapped.role = item.role;
      return mapped;
    });
  }
  return out;
}

function toLocators(artifact: CapabilityArtifact): MultiStrategyLocator[] {
  return Object.values(artifact.locators).map((l) => {
    const locator: MultiStrategyLocator = {
      id: l.id,
      strategies: l.strategies as MultiStrategyLocator["strategies"],
    };
    if (l.description !== undefined) locator.description = l.description;
    return locator;
  });
}

function buildAction(
  step: CapabilityStep,
  inputs: Record<string, unknown>,
  origin: string,
): ActionIntent {
  const args = step.args ?? {};
  switch (step.op) {
    case "navigate": {
      const raw = resolveBinding(args.url, inputs);
      const url = raw.startsWith("http") ? raw : new URL(raw, origin).toString();
      return { type: "navigate", url };
    }
    case "click":
      if (!step.targetRef) throw new Error(`Step ${step.id}: click requires targetRef`);
      return { type: "click", targetRef: step.targetRef };
    case "type": {
      if (!step.targetRef) throw new Error(`Step ${step.id}: type requires targetRef`);
      return {
        type: "type",
        targetRef: step.targetRef,
        text: resolveBinding(args.text, inputs),
      };
    }
    case "select": {
      if (!step.targetRef) throw new Error(`Step ${step.id}: select requires targetRef`);
      return {
        type: "select",
        targetRef: step.targetRef,
        value: resolveBinding(args.value, inputs),
      };
    }
    case "press":
      return { type: "press", key: resolveBinding(args.key, inputs) };
    case "extract": {
      if (!step.targetRef) throw new Error(`Step ${step.id}: extract requires targetRef`);
      return {
        type: "extract",
        targetRef: step.targetRef,
        outputKey: resolveBinding(args.outputKey, inputs) || "value",
      };
    }
    case "wait":
      return {
        type: "wait",
        spec: {
          kind: "timeout",
          ms: Number(resolveBinding(args.ms, inputs) || 500),
        },
      };
    case "dismiss_dialog":
      return { type: "dismiss_dialog" };
    case "accept_dialog":
      return { type: "accept_dialog" };
    default: {
      const _e: never = step.op;
      throw new Error(`Unsupported op ${_e}`);
    }
  }
}

function validateInputs(
  artifact: CapabilityArtifact,
  inputs: Record<string, unknown>,
): string | null {
  const required = artifact.inputs.required ?? [];
  for (const key of required) {
    if (inputs[key] === undefined || inputs[key] === null || inputs[key] === "") {
      return `Missing required input: ${key}`;
    }
  }
  return null;
}

/**
 * Deterministic replay — PLAN Phase 6. No LLM in the decision loop.
 */
export async function runReplay(input: ReplayInput): Promise<ReplayResult> {
  const artifact = loadArtifact(input.artifactPath);
  let inputs: Record<string, unknown>;
  try {
    inputs = JSON.parse(input.inputJson) as Record<string, unknown>;
  } catch {
    return {
      status: "failed",
      error: {
        expected: "valid JSON object",
        observed: input.inputJson,
        category: "hard_failure",
      },
    };
  }

  const missing = validateInputs(artifact, inputs);
  if (missing) {
    return {
      status: "failed",
      error: {
        expected: "all required inputs",
        observed: missing,
        category: "hard_failure",
      },
    };
  }

  const origin = artifact.entry.originAllowlist[0]!;
  const evidence = createEvidenceRun({
    mode: "replay",
    baseDir: input.evidenceBaseDir ?? "evidence",
  });
  evidence.writeMeta({
    mode: "replay",
    artifactPath: input.artifactPath,
    artifactId: artifact.id,
    artifactName: artifact.name,
    inputs,
    startedAt: new Date().toISOString(),
  });

  const policy = createPolicyEngine({
    ...demoCorePolicyConfig(origin),
    allowedOrigins: artifact.entry.originAllowlist,
    allowedActions: artifact.policy.allowedActions,
  });
  policy.resetBudget();

  const driver = await PlaywrightWebDriver.create({
    headless: input.headless ?? true,
    beforeAct: createBeforeActGuard(policy, {
      approvedForUnattended: artifact.policy.approvedForUnattended,
      mode: "replay",
    }),
    evidenceDir: evidence.screenshotDir,
  });
  driver.registerTargets(toLocators(artifact));

  const outputs: Record<string, unknown> = {};
  let recoveriesUsed = 0;

  try {
    const startUrl = new URL(artifact.entry.startPath, origin).toString();
    const nav = await driver.act({ type: "navigate", url: startUrl });
    evidence.append({ type: "navigate_entry", startUrl, ok: nav.ok, message: nav.message });
    if (!nav.ok) {
      const ev = await driver.captureEvidence("entry-nav-failed", evidence.screenshotDir);
      const result: ReplayResult = {
        status: "failed",
        error: {
          stepId: "entry",
          expected: `navigate ${startUrl}`,
          observed: nav.message ?? "navigation failed",
          category: "hard_failure",
        },
        evidence: { dir: evidence.dir, ...ev },
      };
      evidence.writeResult(result);
      return result;
    }

    for (const step of artifact.steps) {
      // Outcome check before step (e.g. already on error page)
      const preObs = await driver.observe();
      const pageText = preObs.ariaSnapshot ?? "";
      const preHit = matchOutcome(artifact.knownOutcomes, {
        url: preObs.url,
        observation: preObs,
        pageText,
      });
      if (preHit) {
        const ev = await driver.captureEvidence(`outcome-${preHit.code}`, evidence.screenshotDir);
        const result: ReplayResult = {
          status: "business_outcome",
          code: preHit.code,
          message: preHit.description,
          evidence: { dir: evidence.dir, ...ev },
        };
        evidence.append({ type: "business_outcome", code: preHit.code, stepId: step.id });
        evidence.writeResult(result);
        return result;
      }

      const recovery = matchRecovery(artifact.recoveries, {
        url: preObs.url,
        observation: preObs,
        pageText,
      });
      if (recovery && recoveriesUsed < 3) {
        recoveriesUsed += 1;
        evidence.append({ type: "recovery", id: recovery.id, stepId: step.id });
        for (const rStep of recovery.then) {
          const rAction = buildAction(rStep, inputs, origin);
          const rRes = await driver.act(rAction);
          evidence.append({
            type: "recovery_act",
            stepId: rStep.id,
            ok: rRes.ok,
            message: rRes.message,
          });
        }
      }

      const action = buildAction(step, inputs, origin);
      const result = await driver.act(action);
      evidence.append({
        type: "act",
        stepId: step.id,
        op: step.op,
        ok: result.ok,
        resolvedBy: result.resolvedBy,
        message: result.message,
        extracted: result.extracted,
      });

      if (result.extracted) {
        Object.assign(outputs, result.extracted);
      }

      if (!result.ok) {
        // Re-observe for business outcome vs hard failure
        const obs = await driver.observe();
        const hit = matchOutcome(artifact.knownOutcomes, {
          url: obs.url,
          observation: obs,
          pageText: obs.ariaSnapshot ?? "",
        });
        const ev = await driver.captureEvidence(`step-${step.id}`, evidence.a11yDir);
        if (hit) {
          const bo: ReplayResult = {
            status: "business_outcome",
            code: hit.code,
            message: hit.description,
            evidence: { dir: evidence.dir, ...ev },
          };
          evidence.writeResult(bo);
          return bo;
        }
        const failed: ReplayResult = {
          status: "failed",
          error: {
            stepId: step.id,
            expected: `${step.op} ${step.targetRef ?? ""}`.trim(),
            observed: result.message ?? "action failed",
            category: result.message?.includes("policy")
              ? "policy_violation"
              : "hard_failure",
          },
          evidence: { dir: evidence.dir, ...ev },
        };
        evidence.writeResult(failed);
        return failed;
      }

      if (step.postconditions) {
        const cp = await driver.checkpoint(toCheckpointSpec(step.postconditions));
        evidence.append({ type: "postcondition", stepId: step.id, ...cp });
        if (!cp.passed) {
          const obs = await driver.observe();
          const hit = matchOutcome(artifact.knownOutcomes, {
            url: obs.url,
            observation: obs,
            pageText: obs.ariaSnapshot ?? "",
          });
          const ev = await driver.captureEvidence(`post-${step.id}`, evidence.screenshotDir);
          if (hit) {
            const bo: ReplayResult = {
              status: "business_outcome",
              code: hit.code,
              message: hit.description,
              evidence: { dir: evidence.dir, ...ev },
            };
            evidence.writeResult(bo);
            return bo;
          }
          const failed: ReplayResult = {
            status: "failed",
            error: {
              stepId: step.id,
              expected: cp.expected,
              observed: cp.observed,
              category: "hard_failure",
            },
            evidence: { dir: evidence.dir, ...ev },
          };
          evidence.writeResult(failed);
          return failed;
        }
      }
    }

    // After steps, check outcomes (e.g. not-found banner on home)
    const finalObs = await driver.observe();
    const finalHit = matchOutcome(artifact.knownOutcomes, {
      url: finalObs.url,
      observation: finalObs,
      pageText: finalObs.ariaSnapshot ?? "",
    });
    if (finalHit) {
      const ev = await driver.captureEvidence(`final-${finalHit.code}`, evidence.screenshotDir);
      const bo: ReplayResult = {
        status: "business_outcome",
        code: finalHit.code,
        message: finalHit.description,
        evidence: { dir: evidence.dir, ...ev },
      };
      evidence.writeResult(bo);
      return bo;
    }

    const successCp = await driver.checkpoint(toCheckpointSpec(artifact.success));
    evidence.append({ type: "success_checkpoint", ...successCp });
    if (!successCp.passed) {
      const ev = await driver.captureEvidence("success-checkpoint", evidence.screenshotDir);
      const failed: ReplayResult = {
        status: "failed",
        error: {
          expected: successCp.expected,
          observed: successCp.observed,
          category: "hard_failure",
        },
        evidence: { dir: evidence.dir, ...ev },
      };
      evidence.writeResult(failed);
      return failed;
    }

    const ok: ReplayResult = {
      status: "success",
      outputs,
      evidence: { dir: evidence.dir },
    };
    evidence.writeResult(ok);
    logger.info({ runId: evidence.runId, outputs }, "replay success");
    return ok;
  } finally {
    await driver.dispose();
  }
}

export function artifactAbsPath(relativePath: string): string {
  return path.resolve(relativePath);
}
