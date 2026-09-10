import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReplay } from "../src/replay/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:4173";
const ARTIFACT = "capabilities/lookup-savings/1.0.0.json";

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

describe("deterministic replay", () => {
  let server: ChildProcess | null = null;
  let startedByUs = false;

  beforeAll(async () => {
    process.env.DEMO_CORE_PASSWORD = process.env.DEMO_CORE_PASSWORD || "demo-pass";
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

  it("replays lookup-savings happily for member 12345", async () => {
    const result = await runReplay({
      artifactPath: ARTIFACT,
      inputJson: JSON.stringify({ memberId: "12345" }),
      headless: true,
      evidenceBaseDir: path.join(root, "tmp", "evidence"),
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(String(result.outputs.savingsBalance)).toMatch(/1,842\.55/);
    }
  }, 120_000);

  it("returns business_outcome NOT_FOUND for unknown member", async () => {
    const result = await runReplay({
      artifactPath: ARTIFACT,
      inputJson: JSON.stringify({ memberId: "NOPE" }),
      headless: true,
      evidenceBaseDir: path.join(root, "tmp", "evidence"),
    });
    expect(result.status).toBe("business_outcome");
    if (result.status === "business_outcome") {
      expect(result.code).toBe("NOT_FOUND");
    }
  }, 120_000);
});
