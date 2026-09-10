import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PolicyViolationError,
  createBeforeActGuard,
  createPolicyEngine,
  demoCorePolicyConfig,
} from "../src/policy/index.js";
import { PlaywrightWebDriver } from "../src/surface/playwrightWebDriver.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:4173";

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${ORIGIN}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("demo-core did not become healthy");
}

describe("policy-enforced PlaywrightWebDriver", () => {
  let server: ChildProcess | null = null;
  let startedByUs = false;

  beforeAll(async () => {
    try {
      const res = await fetch(`${ORIGIN}/health`);
      if (res.ok) {
        startedByUs = false;
        return;
      }
    } catch {
      // start
    }
    startedByUs = true;
    server = spawn("npx", ["tsx", "apps/demo-core/server.ts"], {
      cwd: root,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, DEMO_CORE_PORT: "4173" },
    });
    await waitForHealth();
  }, 60_000);

  afterAll(() => {
    if (startedByUs && server?.pid) {
      try {
        process.kill(server.pid);
      } catch {
        // ignore
      }
    }
  });

  it("blocks off-allowlist navigation via beforeAct", async () => {
    const engine = createPolicyEngine(demoCorePolicyConfig(ORIGIN));
    engine.resetBudget();
    const driver = await PlaywrightWebDriver.create({
      headless: true,
      beforeAct: createBeforeActGuard(engine),
    });

    try {
      const denied = await driver.act({
        type: "navigate",
        url: "https://example.com/",
      });
      expect(denied.ok).toBe(false);
      expect(denied.message).toMatch(/DENY_ORIGIN|policy/);

      const allowed = await driver.act({
        type: "navigate",
        url: `${ORIGIN}/login`,
      });
      expect(allowed.ok).toBe(true);
    } finally {
      await driver.dispose();
    }
  }, 60_000);

  it("surfaces PolicyViolationError code on deny", () => {
    const engine = createPolicyEngine(demoCorePolicyConfig(ORIGIN));
    let caught: unknown;
    try {
      engine.assertAllowed({ type: "navigate", url: "https://evil.test/" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PolicyViolationError);
    expect((caught as PolicyViolationError).code).toBe("DENY_ORIGIN");
  });
});
