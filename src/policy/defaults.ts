import { env } from "../shared/env.js";
import type { PolicyConfig } from "./types.js";

/**
 * Default policy for local demo-core (fail-closed financial posture).
 */
export function demoCorePolicyConfig(origin = env.DEMO_CORE_ORIGIN): PolicyConfig {
  return {
    name: "demo-core",
    allowedOrigins: [origin],
    allowedPathPrefixes: [
      "/",
      "/login",
      "/logout",
      "/home",
      "/members",
      "/interstitial",
      "/inject",
      "/health",
    ],
    allowedActions: [
      "navigate",
      "click",
      "type",
      "select",
      "press",
      "extract",
      "wait",
      "dismiss_dialog",
      "accept_dialog",
    ],
    deniedActions: ["download", "file_upload", "eval", "os_shell"],
    maxSteps: 40,
    maxRuntimeMs: 180_000,
    risk: {
      irreversible: [
        "submit_transfer",
        "delete_record",
        "close_account",
        "confirm_payment",
      ],
      requiresHumanApproval: [
        "submit_transfer",
        "delete_record",
        "close_account",
        "confirm_payment",
      ],
      safeReversible: [
        "navigate",
        "click",
        "type",
        "select",
        "press",
        "extract",
        "wait",
        "dismiss_dialog",
        "accept_dialog",
      ],
    },
  };
}
