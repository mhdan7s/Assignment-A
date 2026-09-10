import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import { z } from "zod";
import { env, requireGeminiApiKey } from "../shared/env.js";
import { logger } from "../shared/logger.js";

/**
 * Gemini client + structured tool calling — PLAN Phase 4 / AGENTS.md §10.
 * Used by discovery only (not default replay).
 */

export const AgentDecisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("act"),
    action: z.enum([
      "navigate",
      "click",
      "type",
      "select",
      "press",
      "extract",
      "wait",
    ]),
    targetRef: z.string().optional(),
    url: z.string().optional(),
    text: z.string().optional(),
    value: z.string().optional(),
    key: z.string().optional(),
    outputKey: z.string().optional(),
    waitMs: z.number().optional(),
    rationale: z.string(),
  }),
  z.object({
    type: z.literal("declare_success"),
    rationale: z.string(),
  }),
  z.object({
    type: z.literal("declare_stuck"),
    rationale: z.string(),
  }),
]);

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

const decideFn: FunctionDeclaration = {
  name: "decide",
  description: "Choose the next computer-use action, or declare success/stuck",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      type: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["act", "declare_success", "declare_stuck"],
      },
      action: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["navigate", "click", "type", "select", "press", "extract", "wait"],
        nullable: true,
      },
      targetRef: { type: SchemaType.STRING, nullable: true },
      url: { type: SchemaType.STRING, nullable: true },
      text: { type: SchemaType.STRING, nullable: true },
      value: { type: SchemaType.STRING, nullable: true },
      key: { type: SchemaType.STRING, nullable: true },
      outputKey: { type: SchemaType.STRING, nullable: true },
      waitMs: { type: SchemaType.NUMBER, nullable: true },
      rationale: { type: SchemaType.STRING },
    },
    required: ["type", "rationale"],
  },
};

export type LlmClient = {
  model: string;
  decide(prompt: string): Promise<AgentDecision>;
};

export function createLlmClient(options?: { model?: string; apiKey?: string }): LlmClient {
  const apiKey = options?.apiKey ?? requireGeminiApiKey();
  const modelName = options?.model ?? env.GEMINI_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: [{ functionDeclarations: [decideFn] }],
  });

  return {
    model: modelName,
    async decide(prompt: string): Promise<AgentDecision> {
      const result = await model.generateContent(prompt);
      const call = result.response.functionCalls()?.[0];
      if (!call || call.name !== "decide") {
        logger.warn({ response: result.response.text() }, "LLM returned no decide() call");
        return {
          type: "declare_stuck",
          rationale: "Model did not return a decide() tool call",
        };
      }
      const parsed = AgentDecisionSchema.safeParse(normalizeDecision(call.args));
      if (!parsed.success) {
        logger.warn({ err: parsed.error.message, args: call.args }, "Invalid decide payload");
        return {
          type: "declare_stuck",
          rationale: `Invalid model decision: ${parsed.error.message}`,
        };
      }
      return parsed.data;
    },
  };
}

function normalizeDecision(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const a = { ...(args as Record<string, unknown>) };
  if (a.type === "act" && a.action == null) {
    a.action = "wait";
  }
  return a;
}
