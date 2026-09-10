import { describe, expect, it } from "vitest";
import { looksGeneratedId, orderedStrategyKinds } from "../src/surface/locators.js";
import type { MultiStrategyLocator } from "../src/surface/types.js";

describe("locator strategy order", () => {
  it("orders strategies a11y → label → attribute → structural → visual", () => {
    const target: MultiStrategyLocator = {
      id: "username",
      strategies: [
        { kind: "visual" },
        { kind: "structural", css: "#x" },
        { kind: "a11y", role: "textbox", name: "Username" },
        { kind: "attribute", attribute: "name", value: "username" },
        { kind: "label", text: "Username" },
      ],
    };
    expect(orderedStrategyKinds(target)).toEqual([
      "a11y",
      "label",
      "attribute",
      "structural",
      "visual",
    ]);
  });

  it("detects generated ids", () => {
    expect(looksGeneratedId("ui_12345")).toBe(true);
    expect(looksGeneratedId("username")).toBe(false);
  });
});
