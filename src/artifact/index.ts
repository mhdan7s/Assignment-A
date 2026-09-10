import fs from "node:fs";
import path from "node:path";
import { redactForArtifact } from "../policy/redact.js";
import {
  CapabilityArtifactSchema,
  type CapabilityArtifact,
  type ValueBinding,
} from "./schema.js";

/**
 * Capability artifact load/save/validate — PLAN Phase 5 / AGENTS.md §4.2.
 */
export {
  CapabilityArtifactSchema,
  type CapabilityArtifact,
  type CapabilityStep,
  type OutcomeDetector,
  type RecoveryRule,
  type ValueBinding,
} from "./schema.js";

export function validateArtifact(data: unknown) {
  return CapabilityArtifactSchema.safeParse(data);
}

export function parseArtifact(data: unknown): CapabilityArtifact {
  return CapabilityArtifactSchema.parse(data);
}

export function loadArtifact(filePath: string): CapabilityArtifact {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseArtifact(JSON.parse(raw));
}

export function saveArtifact(filePath: string, artifact: CapabilityArtifact): void {
  const validated = parseArtifact(artifact);
  const redacted = redactForArtifact(validated) as CapabilityArtifact;
  // Re-validate after redaction (structure must remain intact)
  const finalArtifact = parseArtifact(redacted);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(finalArtifact, null, 2)}\n`, "utf8");
}

export function defaultArtifactPath(name: string, version: string): string {
  return path.join("capabilities", name, `${version}.json`);
}

export function resolveBinding(
  binding: ValueBinding | undefined,
  inputs: Record<string, unknown>,
): string {
  if (binding === undefined) return "";
  if (typeof binding === "string" || typeof binding === "number" || typeof binding === "boolean") {
    return String(binding);
  }
  if ("$input" in binding) {
    const v = inputs[binding.$input];
    if (v === undefined) {
      throw new Error(`Missing input parameter: ${binding.$input}`);
    }
    return String(v);
  }
  if ("$env" in binding) {
    const v = process.env[binding.$env];
    if (v === undefined || v === "") {
      throw new Error(`Missing env binding: ${binding.$env}`);
    }
    return v;
  }
  throw new Error(`Unsupported binding: ${JSON.stringify(binding)}`);
}
