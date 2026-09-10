import pino from "pino";
import { env } from "./env.js";

/**
 * Structured logger with redaction defaults (AGENTS.md §6 / PLAN Phase 3).
 * Secrets and raw PII must never land in artifacts or logs.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "ssn",
      "pan",
      "*.password",
      "*.token",
      "*.authorization",
      "*.cookie",
      "*.ssn",
      "*.pan",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});
