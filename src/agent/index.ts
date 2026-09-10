import { randomUUID } from "node:crypto";
import {
  defaultArtifactPath,
  saveArtifact,
  type CapabilityArtifact,
  type CapabilityStep,
} from "../artifact/index.js";
import { createEvidenceRun } from "../evidence/index.js";
import { createLlmClient, type AgentDecision } from "../llm/index.js";
import {
  createBeforeActGuard,
  createPolicyEngine,
  demoCorePolicyConfig,
} from "../policy/index.js";
import { PlaywrightWebDriver } from "../surface/playwrightWebDriver.js";
import type { ActionIntent, MultiStrategyLocator } from "../surface/types.js";

/**
 * LLM-driven discovery agent loop — PLAN Phase 4 / AGENTS.md §4.1.
 */

export type DiscoveryInput = {
  goal: string;
  targetUrl: string;
  outPath?: string;
  maxSteps?: number;
  headless?: boolean;
  memberIdHint?: string;
};

export type DiscoveryResult = {
  runId: string;
  artifactPath: string;
  evidenceDir: string;
  success: boolean;
  message: string;
};

const DEMO_LOCATORS: MultiStrategyLocator[] = [
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
  {
    id: "member_id",
    strategies: [
      { kind: "a11y", role: "textbox", name: "Member ID" },
      { kind: "label", text: "Member ID" },
    ],
  },
  {
    id: "search",
    strategies: [{ kind: "a11y", role: "button", name: "Search members" }],
  },
  {
    id: "savings_balance",
    strategies: [
      {
        kind: "structural",
        css: 'span[aria-label="Savings balance"]',
        frame: { title: "Account detail pane" },
      },
    ],
  },
  {
    id: "continue_notice",
    strategies: [{ kind: "a11y", role: "button", name: "Continue" }],
  },
];

function decisionToAction(d: Extract<AgentDecision, { type: "act" }>): ActionIntent {
  switch (d.action) {
    case "navigate":
      return { type: "navigate", url: d.url ?? "" };
    case "click":
      return { type: "click", targetRef: d.targetRef ?? "" };
    case "type":
      return { type: "type", targetRef: d.targetRef ?? "", text: d.text ?? "" };
    case "select":
      return { type: "select", targetRef: d.targetRef ?? "", value: d.value ?? "" };
    case "press":
      return { type: "press", key: d.key ?? "Enter" };
    case "extract":
      return {
        type: "extract",
        targetRef: d.targetRef ?? "",
        outputKey: d.outputKey ?? "value",
      };
    case "wait":
      return { type: "wait", spec: { kind: "timeout", ms: Math.min(d.waitMs ?? 500, 5000) } };
    default: {
      const _e: never = d.action;
      throw new Error(`Unknown action ${_e}`);
    }
  }
}

function buildPrompt(args: {
  goal: string;
  observation: string;
  history: string[];
  targetRefs: string[];
}): string {
  return `You are a computer-use agent for a synthetic bank back-office UI (demo-core).
Goal: ${args.goal}

Rules:
- Use ONLY these targetRef values when clicking/typing/extracting: ${args.targetRefs.join(", ")}
- Prefer accessibility names already reflected in those refs.
- Login credentials for this sandbox: username "teller", password "demo-pass".
- Do not invent URLs outside the current app origin.
- When the savings balance is visible in the detail pane, extract targetRef=savings_balance with outputKey=savingsBalance, then declare_success.
- If blocked after several tries, declare_stuck.

Recent actions:
${args.history.slice(-8).join("\n") || "(none)"}

Current observation (aria snapshot / url):
${args.observation}
`;
}

export async function runDiscovery(input: DiscoveryInput): Promise<DiscoveryResult> {
  const maxSteps = input.maxSteps ?? 25;
  const evidence = createEvidenceRun({ mode: "discover" });
  const llm = createLlmClient();

  evidence.writeMeta({
    mode: "discover",
    goal: input.goal,
    targetUrl: input.targetUrl,
    model: llm.model,
    startedAt: new Date().toISOString(),
  });

  const origin = new URL(input.targetUrl).origin;
  const policy = createPolicyEngine(demoCorePolicyConfig(origin));
  policy.resetBudget();

  const driver = await PlaywrightWebDriver.create({
    headless: input.headless ?? true,
    beforeAct: createBeforeActGuard(policy, { mode: "discovery" }),
    evidenceDir: evidence.screenshotDir,
  });
  driver.registerTargets(DEMO_LOCATORS);

  const recorded: CapabilityStep[] = [];
  const history: string[] = [];
  const outputs: Record<string, unknown> = {};
  let stuckReason = "";

  try {
    await driver.act({ type: "navigate", url: input.targetUrl });
    evidence.append({ type: "navigate", url: input.targetUrl });

    for (let i = 0; i < maxSteps; i++) {
      const obs = await driver.observe();
      const observation = `URL: ${obs.url}\nTitle: ${obs.title}\n${obs.ariaSnapshot ?? JSON.stringify(obs.a11yTree)?.slice(0, 4000)}`;
      const decision = await llm.decide(
        buildPrompt({
          goal: input.goal,
          observation,
          history,
          targetRefs: DEMO_LOCATORS.map((l) => l.id),
        }),
      );
      evidence.append({ type: "decide", step: i, decision });
      history.push(`${decision.type}: ${JSON.stringify(decision)}`);

      if (decision.type === "declare_success") {
        const artifact = compileDiscoveryArtifact({
          goal: input.goal,
          origin,
          startPath: new URL(input.targetUrl).pathname || "/login",
          steps: recorded,
          outputs,
          runId: evidence.runId,
        });
        const outPath =
          input.outPath ?? defaultArtifactPath(artifact.name, artifact.capabilityVersion);
        saveArtifact(outPath, artifact);
        evidence.writeResult({ status: "success", artifactPath: outPath, outputs });
        return {
          runId: evidence.runId,
          artifactPath: outPath,
          evidenceDir: evidence.dir,
          success: true,
          message: decision.rationale,
        };
      }

      if (decision.type === "declare_stuck") {
        stuckReason = decision.rationale;
        await driver.captureEvidence("stuck", evidence.screenshotDir);
        break;
      }

      const action = decisionToAction(decision);
      const result = await driver.act(action);
      evidence.append({
        type: "act",
        step: i,
        action,
        ok: result.ok,
        message: result.message,
        extracted: result.extracted,
      });
      history.push(`result ok=${result.ok} ${result.message ?? ""}`);

      if (result.ok) {
        recorded.push(decisionToStep(decision, i));
        if (result.extracted) Object.assign(outputs, result.extracted);
      } else {
        await driver.captureEvidence(`fail-${i}`, evidence.screenshotDir);
      }
    }

    evidence.writeResult({ status: "stuck", reason: stuckReason || "max steps" });
    return {
      runId: evidence.runId,
      artifactPath: "",
      evidenceDir: evidence.dir,
      success: false,
      message: stuckReason || "Discovery failed to complete before max steps",
    };
  } finally {
    await driver.dispose();
  }
}

function decisionToStep(
  decision: Extract<AgentDecision, { type: "act" }>,
  index: number,
): CapabilityStep {
  const id = `step_${index + 1}`;
  const args: NonNullable<CapabilityStep["args"]> = {};
  if (decision.url) args.url = decision.url;
  if (decision.text !== undefined) args.text = decision.text;
  if (decision.value) args.value = decision.value;
  if (decision.key) args.key = decision.key;
  if (decision.outputKey) args.outputKey = decision.outputKey;
  if (decision.waitMs) args.ms = decision.waitMs;

  const step: CapabilityStep = {
    id,
    op: decision.action,
    rationale: decision.rationale,
  };
  if (decision.targetRef) step.targetRef = decision.targetRef;
  if (Object.keys(args).length) step.args = args;
  return step;
}

function compileDiscoveryArtifact(args: {
  goal: string;
  origin: string;
  startPath: string;
  steps: CapabilityStep[];
  outputs: Record<string, unknown>;
  runId: string;
}): CapabilityArtifact {
  const steps = args.steps.map((s) => {
    if (s.op === "type" && s.targetRef === "member_id" && s.args?.text) {
      return {
        ...s,
        args: { ...s.args, text: { $input: "memberId" as const } },
      };
    }
    if (s.op === "type" && s.targetRef === "password") {
      return {
        ...s,
        args: { text: { $env: "DEMO_CORE_PASSWORD" as const } },
      };
    }
    return s;
  });

  const locators: CapabilityArtifact["locators"] = {};
  for (const l of DEMO_LOCATORS) {
    locators[l.id] = {
      id: l.id,
      strategies: l.strategies,
      ...(l.description ? { description: l.description } : {}),
    };
  }

  return {
    schemaVersion: "1.0.0",
    id: `cap_${randomUUID()}`,
    name: "discovered-capability",
    description: args.goal,
    capabilityVersion: "0.1.0",
    appFamily: "demo-core-banking",
    surfaceKind: "web",
    entry: {
      originAllowlist: [args.origin],
      startPath: args.startPath,
    },
    inputs: {
      type: "object",
      properties: {
        memberId: { type: "string", description: "Member ID" },
      },
      required: ["memberId"],
      additionalProperties: false,
    },
    outputs: {
      type: "object",
      properties: {
        savingsBalance: { type: "string" },
      },
      required: Object.keys(args.outputs),
      additionalProperties: true,
    },
    steps:
      steps.length > 0
        ? steps
        : [
            {
              id: "noop",
              op: "wait",
              args: { ms: 1 },
            },
          ],
    success: {
      description: "Goal completed during discovery",
      a11yIncludes: [{ name: "Savings balance" }],
    },
    knownOutcomes: [
      {
        code: "NOT_FOUND",
        description: "No member matches the given ID",
        a11yIncludesAny: ["record not found"],
      },
    ],
    recoveries: [],
    locators,
    policy: {
      riskLevel: "safe",
      requiresApproval: false,
      allowedActions: [
        "navigate",
        "click",
        "type",
        "select",
        "press",
        "extract",
        "wait",
        "dismiss_dialog",
        "accept_dialog",
      ],
      approvedForUnattended: false,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      sourceRunId: args.runId,
      author: "discovery-agent",
      approvalState: "draft",
    },
  };
}
