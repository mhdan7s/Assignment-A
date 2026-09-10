import { describe, expect, it } from "vitest";
import {
  PolicyViolationError,
  createBeforeActGuard,
  createPolicyEngine,
  demoCorePolicyConfig,
  redactDeep,
  REDACTED,
} from "../src/policy/index.js";

describe("PolicyEngine", () => {
  const engine = createPolicyEngine(demoCorePolicyConfig("http://127.0.0.1:4173"));

  it("allows navigation within demo-core allowlist", () => {
    expect(engine.checkNavigation("http://127.0.0.1:4173/login")).toEqual({ allow: true });
    expect(engine.checkNavigation("http://127.0.0.1:4173/members/12345")).toEqual({
      allow: true,
    });
  });

  it("denies off-allowlist origins", () => {
    const d = engine.checkNavigation("https://evil.example/login");
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.code).toBe("DENY_ORIGIN");
  });

  it("denies paths outside prefixes", () => {
    const d = engine.checkNavigation("http://127.0.0.1:4173/secret-admin");
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.code).toBe("DENY_PATH");
  });

  it("denies explicitly blocked action types", () => {
    const d = engine.checkAction("eval");
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.code).toBe("DENY_ACTION");
  });

  it("fail-closes irreversible actions without approval", () => {
    const d = engine.checkAction("submit_transfer");
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.code).toBe("DENY_RISK");
  });

  it("still blocks irreversible even with approval if not allowlisted", () => {
    const d = engine.checkAction("submit_transfer", { approvedForUnattended: true });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.code).toBe("DENY_RISK");
  });

  it("allows safe actions", () => {
    expect(engine.checkAction("click")).toEqual({ allow: true });
    expect(engine.checkAction("type")).toEqual({ allow: true });
  });

  it("checkIntent enforces navigate + budget", () => {
    const local = createPolicyEngine({
      ...demoCorePolicyConfig("http://127.0.0.1:4173"),
      maxSteps: 2,
    });
    expect(local.checkIntent({ type: "click", targetRef: "x" }).allow).toBe(true);
    expect(local.checkIntent({ type: "click", targetRef: "y" }).allow).toBe(true);
    const over = local.checkIntent({ type: "click", targetRef: "z" });
    expect(over.allow).toBe(false);
    if (!over.allow) expect(over.code).toBe("DENY_BUDGET");
  });

  it("beforeAct guard throws PolicyViolationError", () => {
    const guard = createBeforeActGuard(engine);
    expect(() =>
      guard({ type: "navigate", url: "https://evil.example/" }),
    ).toThrow(PolicyViolationError);
  });
});

describe("redaction", () => {
  it("redacts sensitive keys and masks long account-like numbers", () => {
    const cleaned = redactDeep({
      username: "teller",
      password: "demo-pass",
      token: "abc",
      nested: { authorization: "Bearer x", note: "ok" },
      pan: "4111111111111111",
      memberId: "12345",
    });

    expect(cleaned.password).toBe(REDACTED);
    expect(cleaned.token).toBe(REDACTED);
    expect(cleaned.nested.authorization).toBe(REDACTED);
    expect(cleaned.nested.note).toBe("ok");
    expect(cleaned.pan).toBe(REDACTED);
    expect(cleaned.memberId).toBe("12345");
    expect(String(cleaned.username)).toBe("teller");
  });
});
