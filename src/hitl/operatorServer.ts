import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { HitlResolveSignal, InterventionRequest } from "./types.js";
import { logger } from "../shared/logger.js";

export type OperatorServer = {
  port: number;
  url: string;
  close: () => Promise<void>;
  waitForSignal: (timeoutMs: number) => Promise<HitlResolveSignal>;
};

/**
 * Minimal mock operator console — not a full co-browse product.
 * Human still uses the live headed browser for the same Playwright session;
 * this UI only carries context + resume/abort signaling.
 */
export async function startOperatorServer(options: {
  intervention: InterventionRequest;
  port?: number;
  screenshotPath?: string;
}): Promise<OperatorServer> {
  const port = options.port ?? 4174;
  let resolveSignal: ((s: HitlResolveSignal) => void) | null = null;
  let signal: HitlResolveSignal | null = null;

  const signalPromise = new Promise<HitlResolveSignal>((resolve) => {
    resolveSignal = resolve;
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  const render = () => {
    const shot = options.screenshotPath
      ? `<p><img src="/screenshot?ts=${Date.now()}" alt="Current session screenshot" style="max-width:100%;border:1px solid #ccc"/></p>`
      : `<p><em>No screenshot attached.</em></p>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Operator handoff</title>
  <style>
    body{font-family:Tahoma,sans-serif;margin:24px;max-width:840px;color:#14213d;background:#f4f6f8}
    .card{background:#fff;border:1px solid #cfd6e0;padding:16px 18px;margin-bottom:14px}
    h1{margin:0 0 8px;font-size:22px}
    code,pre{background:#eef2f6;padding:2px 6px}
    pre{padding:10px;overflow:auto;white-space:pre-wrap}
    button{font:inherit;padding:8px 14px;margin-right:8px;cursor:pointer}
    .resume{background:#0f6b5c;color:#fff;border:0}
    .abort{background:#8b1e1e;color:#fff;border:0}
    .muted{color:#5a6577}
  </style>
</head>
<body>
  <div class="card">
    <h1>Human intervention required</h1>
    <p class="muted">Operate the <strong>same live browser window</strong> opened by automation, then Resume or Abort here.</p>
  </div>
  <div class="card">
    <p><strong>Intervention</strong>: <code>${escapeHtml(options.intervention.id)}</code></p>
    <p><strong>Run</strong>: <code>${escapeHtml(options.intervention.runId)}</code></p>
    <p><strong>Session</strong>: <code>${escapeHtml(options.intervention.sessionId)}</code></p>
    <p><strong>Reason</strong>: <code>${escapeHtml(options.intervention.reason)}</code></p>
    <p><strong>Goal / capability</strong>: ${escapeHtml(options.intervention.capabilityOrGoal)}</p>
    ${options.intervention.stepId ? `<p><strong>Step</strong>: <code>${escapeHtml(options.intervention.stepId)}</code></p>` : ""}
    <p><strong>Instructions</strong>: ${escapeHtml(options.intervention.instructionsForHuman)}</p>
    <pre aria-label="Observation summary">${escapeHtml(options.intervention.observationSummary)}</pre>
    ${shot}
  </div>
  <div class="card">
    <form method="post" action="/resume" style="display:inline">
      <button class="resume" type="submit" aria-label="Resume automation">Resume automation</button>
    </form>
    <form method="post" action="/abort" style="display:inline">
      <button class="abort" type="submit" aria-label="Abort run">Abort run</button>
    </form>
  </div>
  <script>setTimeout(()=>location.reload(), 4000)</script>
</body>
</html>`;
  };

  app.get("/", (_req, res) => {
    res.type("html").send(render());
  });

  app.get("/screenshot", (_req, res) => {
    if (!options.screenshotPath || !fs.existsSync(options.screenshotPath)) {
      res.status(404).send("no screenshot");
      return;
    }
    res.sendFile(path.resolve(options.screenshotPath));
  });

  app.get("/api/intervention", (_req, res) => {
    res.json(options.intervention);
  });

  const finish = (s: HitlResolveSignal, res: express.Response) => {
    if (!signal) {
      signal = s;
      resolveSignal?.(s);
    }
    res.type("html").send(
      `<!doctype html><html><body style="font-family:Tahoma;margin:2rem">
        <h1>${s.action === "resume" ? "Resumed" : "Aborted"}</h1>
        <p>You can close this tab. Session ownership handed back to automation.</p>
      </body></html>`,
    );
  };

  app.post("/resume", (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : "operator resumed";
    finish({ action: "resume", note }, res);
  });

  app.post("/abort", (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : "operator aborted";
    finish({ action: "abort", note }, res);
  });

  // JSON API for tests / automation of the mock console
  app.post("/api/resume", (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : "api resume";
    if (!signal) {
      signal = { action: "resume", note };
      resolveSignal?.(signal);
    }
    res.json({ ok: true, signal });
  });

  app.post("/api/abort", (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : "api abort";
    if (!signal) {
      signal = { action: "abort", note };
      resolveSignal?.(signal);
    }
    res.json({ ok: true, signal });
  });

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });

  logger.info({ port, interventionId: options.intervention.id }, "operator console listening");

  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    waitForSignal(timeoutMs: number) {
      return Promise.race([
        signalPromise,
        new Promise<HitlResolveSignal>((_, reject) =>
          setTimeout(() => reject(new Error(`HITL wait timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
