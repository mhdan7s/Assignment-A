import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redactDeep } from "../policy/redact.js";

export type EvidenceMode = "discover" | "replay" | "hitl";

export type EvidenceRun = {
  runId: string;
  dir: string;
  append(event: Record<string, unknown>): void;
  writeMeta(meta: Record<string, unknown>): void;
  writeResult(result: unknown): void;
  screenshotDir: string;
  a11yDir: string;
};

/**
 * Evidence bundles under /evidence/<runId>/ — PLAN Phase 8 / AGENTS.md §12.
 */
export function createEvidenceRun(options: {
  mode: EvidenceMode;
  baseDir?: string;
  runId?: string;
}): EvidenceRun {
  const runId = options.runId ?? `${options.mode}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(options.baseDir ?? "evidence", runId);
  const screenshotDir = path.join(dir, "screenshots");
  const a11yDir = path.join(dir, "a11y");
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(a11yDir, { recursive: true });

  const eventsPath = path.join(dir, "events.jsonl");
  fs.writeFileSync(eventsPath, "", "utf8");

  return {
    runId,
    dir,
    screenshotDir,
    a11yDir,
    append(event) {
      const line = JSON.stringify(
        redactDeep({ ...event, ts: new Date().toISOString(), runId }),
      );
      fs.appendFileSync(eventsPath, `${line}\n`, "utf8");
    },
    writeMeta(meta) {
      fs.writeFileSync(
        path.join(dir, "meta.json"),
        `${JSON.stringify(redactDeep({ runId, ...meta }), null, 2)}\n`,
        "utf8",
      );
    },
    writeResult(result) {
      fs.writeFileSync(
        path.join(dir, "result.json"),
        `${JSON.stringify(redactDeep(result), null, 2)}\n`,
        "utf8",
      );
    },
  };
}
