import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHitlDemo } from "../src/hitl/index.js";

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

describe("HITL same-session handoff", () => {
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

  it("escalates, auto-resumes, keeps the same session, and finishes login", async () => {
    const result = await runHitlDemo({
      headless: true,
      autoResumeMs: 400,
      operatorPort: 4317,
      targetOrigin: ORIGIN,
    });

    expect(result.success).toBe(true);
    expect(result.sameSession).toBe(true);
    expect(result.sessionId).toBe(result.sessionIdAfterResume);
    expect(result.intervention.status).toBe("resumed");
    expect(result.intervention.reason).toBe("stuck_discovery");
    expect(result.finalUrl).toMatch(/\/home/);
  }, 120_000);
});
