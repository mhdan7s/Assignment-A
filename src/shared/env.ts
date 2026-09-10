import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  DEMO_CORE_ORIGIN: z.string().default("http://127.0.0.1:4173"),
  DEMO_CORE_PORT: z.coerce.number().int().positive().default(4173),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Typed process env. Missing GEMINI_API_KEY is allowed at import time —
 * only the discover command should require it when invoked.
 */
export const env: Env = EnvSchema.parse(process.env);

export function requireGeminiApiKey(): string {
  const key = env.GEMINI_API_KEY.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is required for discovery. Copy .env.example to .env and set the key.",
    );
  }
  return key;
}
