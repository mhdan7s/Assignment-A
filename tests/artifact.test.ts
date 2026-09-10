import { describe, expect, it } from "vitest";
import { loadArtifact, validateArtifact } from "../src/artifact/index.js";
import { matchOutcome } from "../src/replay/detect.js";

describe("capability artifact schema", () => {
  it("loads and validates the golden lookup-savings artifact", () => {
    const artifact = loadArtifact("capabilities/lookup-savings/1.0.0.json");
    expect(artifact.name).toBe("lookup-savings");
    expect(artifact.steps.length).toBeGreaterThan(3);
    expect(artifact.locators.savings_balance).toBeTruthy();
    expect(validateArtifact(artifact).success).toBe(true);
  });

  it("rejects garbage payloads", () => {
    expect(validateArtifact({ schemaVersion: "nope" }).success).toBe(false);
  });
});

describe("outcome detectors", () => {
  it("matches NOT_FOUND from aria text", () => {
    const hit = matchOutcome(
      [
        {
          code: "NOT_FOUND",
          description: "missing",
          a11yIncludesAny: ["record not found"],
        },
      ],
      {
        url: "http://127.0.0.1:4173/home?error=not_found",
        observation: {
          url: "http://127.0.0.1:4173/home",
          title: "x",
          a11yTree: null,
          ariaSnapshot: "- status: Record not found: no member matches that ID.",
          capturedAt: new Date().toISOString(),
        },
      },
    );
    expect(hit?.code).toBe("NOT_FOUND");
  });
});
