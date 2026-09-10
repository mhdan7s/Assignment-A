import { z } from "zod";

/**
 * Capability artifact schema — PLAN Phase 5 / AGENTS.md §4.2.
 * Decoupled from raw model transcripts; agent-invocable contract.
 */

export const SchemaVersion = z.literal("1.0.0");

export const FrameHintSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  urlPattern: z.string().optional(),
});

export const LocatorStrategySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("a11y"),
    role: z.string(),
    name: z.string(),
    exact: z.boolean().optional(),
    frame: FrameHintSchema.optional(),
  }),
  z.object({
    kind: z.literal("label"),
    text: z.string(),
    exact: z.boolean().optional(),
    frame: FrameHintSchema.optional(),
  }),
  z.object({
    kind: z.literal("attribute"),
    attribute: z.enum(["name", "id", "placeholder"]),
    value: z.string(),
    frame: FrameHintSchema.optional(),
  }),
  z.object({
    kind: z.literal("structural"),
    css: z.string(),
    frame: FrameHintSchema.optional(),
  }),
  z.object({
    kind: z.literal("visual"),
    note: z.string().optional(),
    frame: FrameHintSchema.optional(),
  }),
]);

export const MultiStrategyLocatorSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  strategies: z.array(LocatorStrategySchema).min(1),
});

export const CheckpointSpecSchema = z.object({
  description: z.string(),
  urlPattern: z.string().optional(),
  a11yIncludes: z
    .array(
      z.object({
        role: z.string().optional(),
        name: z.string(),
      }),
    )
    .optional(),
});

/** Literal or binding into capability inputs / env secrets. */
export const ValueBindingSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ $input: z.string() }),
  z.object({ $env: z.string() }),
]);

export const StepOpSchema = z.enum([
  "navigate",
  "click",
  "type",
  "select",
  "press",
  "extract",
  "wait",
  "dismiss_dialog",
  "accept_dialog",
]);

export const CapabilityStepSchema = z.object({
  id: z.string().min(1),
  op: StepOpSchema,
  targetRef: z.string().optional(),
  args: z.record(ValueBindingSchema).optional(),
  postconditions: CheckpointSpecSchema.optional(),
  rationale: z.string().optional(),
});

export const OutcomeDetectorSchema = z.object({
  code: z.string().min(1),
  description: z.string(),
  urlPattern: z.string().optional(),
  a11yIncludesAny: z.array(z.string()).optional(),
  bannerText: z.string().optional(),
});

export const RecoveryRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  when: z.object({
    urlPattern: z.string().optional(),
    a11yIncludesAny: z.array(z.string()).optional(),
  }),
  then: z.array(CapabilityStepSchema).max(5),
});

export const JsonSchemaLikeSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.unknown()),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

export const CapabilityArtifactSchema = z.object({
  schemaVersion: SchemaVersion,
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  capabilityVersion: z.string().min(1),
  appFamily: z.string().min(1),
  surfaceKind: z.enum(["web", "legacy_web", "desktop"]),
  entry: z.object({
    originAllowlist: z.array(z.string()).min(1),
    startPath: z.string().min(1),
  }),
  inputs: JsonSchemaLikeSchema,
  outputs: JsonSchemaLikeSchema,
  steps: z.array(CapabilityStepSchema).min(1),
  success: CheckpointSpecSchema,
  knownOutcomes: z.array(OutcomeDetectorSchema).default([]),
  recoveries: z.array(RecoveryRuleSchema).default([]),
  locators: z.record(MultiStrategyLocatorSchema),
  policy: z.object({
    riskLevel: z.enum(["safe", "elevated", "irreversible"]),
    requiresApproval: z.boolean(),
    allowedActions: z.array(z.string()),
    approvedForUnattended: z.boolean().default(false),
  }),
  metadata: z.object({
    createdAt: z.string(),
    sourceRunId: z.string().optional(),
    author: z.string().optional(),
    approvalState: z.enum(["draft", "approved"]).default("draft"),
    baseCapabilityId: z.string().optional(),
    tenantOverrides: z.record(z.unknown()).optional(),
  }),
});

export type CapabilityArtifact = z.infer<typeof CapabilityArtifactSchema>;
export type CapabilityStep = z.infer<typeof CapabilityStepSchema>;
export type OutcomeDetector = z.infer<typeof OutcomeDetectorSchema>;
export type RecoveryRule = z.infer<typeof RecoveryRuleSchema>;
export type ValueBinding = z.infer<typeof ValueBindingSchema>;
