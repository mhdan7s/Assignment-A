import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

describe("PlaywrightWebDriver against demo-core", () => {
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
      // need to start
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

  afterAll(async () => {
    if (startedByUs && server?.pid) {
      try {
        process.kill(server.pid);
      } catch {
        // ignore
      }
    }
  });

  it("observes a11y, logs in, and extracts savings balance from iframe", async () => {
    const driver = await PlaywrightWebDriver.create({ headless: true });
    try {
      driver.registerTargets([
        {
          id: "username",
          strategies: [
            { kind: "a11y", role: "textbox", name: "Username" },
            { kind: "label", text: "Username" },
            { kind: "attribute", attribute: "name", value: "username" },
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
              kind: "a11y",
              role: "generic",
              name: "Savings balance",
              frame: { title: "Account detail pane" },
            },
            {
              kind: "label",
              text: "Savings balance",
              frame: { title: "Account detail pane" },
            },
            {
              kind: "structural",
              css: 'span[aria-label="Savings balance"]',
              frame: { title: "Account detail pane" },
            },
          ],
        },
      ]);

      const nav = await driver.act({ type: "navigate", url: `${ORIGIN}/login` });
      expect(nav.ok).toBe(true);

      const obs = await driver.observe({ screenshot: false });
      expect(obs.url).toContain("/login");
      expect(obs.a11yTree || obs.ariaSnapshot).toBeTruthy();

      expect((await driver.act({ type: "type", targetRef: "username", text: "teller" })).ok).toBe(
        true,
      );
      expect(
        (await driver.act({ type: "type", targetRef: "password", text: "demo-pass" })).ok,
      ).toBe(true);
      expect((await driver.act({ type: "click", targetRef: "sign_in" })).ok).toBe(true);

      await driver.waitFor({ kind: "url", pattern: "/home", timeoutMs: 10_000 });

      expect((await driver.act({ type: "type", targetRef: "member_id", text: "12345" })).ok).toBe(
        true,
      );
      expect((await driver.act({ type: "click", targetRef: "search" })).ok).toBe(true);
      await driver.waitFor({ kind: "url", pattern: "/members/12345", timeoutMs: 10_000 });

      const cp = await driver.checkpoint({
        description: "member detail",
        urlPattern: "/members/12345",
        a11yIncludes: [{ name: "Open new sub-account" }],
      });
      expect(cp.passed).toBe(true);

      const extracted = await driver.act({
        type: "extract",
        targetRef: "savings_balance",
        outputKey: "savingsBalance",
      });
      expect(extracted.ok).toBe(true);
      expect(String(extracted.extracted?.savingsBalance)).toMatch(/1,842\.55|\$1,842\.55/);

      const evidence = await driver.captureEvidence("phase2-smoke", path.join(root, "tmp", "surface"));
      expect(evidence.screenshotPath).toBeTruthy();
      expect(evidence.a11yPath).toBeTruthy();

      await driver.pauseForHuman();
      expect(driver.owner).toBe("human");
      await expect(driver.act({ type: "press", key: "Escape" })).resolves.toMatchObject({
        ok: false,
      });
      await driver.resumeFromHuman();
      expect(driver.owner).toBe("automation");
    } finally {
      await driver.dispose();
    }
  }, 90_000);
});
