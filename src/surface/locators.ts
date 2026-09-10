import type { Frame, FrameLocator, Locator, Page } from "playwright";
import type {
  FrameHint,
  LocatorStrategy,
  LocatorStrategyKind,
  MultiStrategyLocator,
} from "./types.js";

const GENERATED_ID = /^(ui_|fld_|sess_|ember\d+|react-select)/i;

export function looksGeneratedId(value: string): boolean {
  return GENERATED_ID.test(value) || /^\d+$/.test(value);
}

function cssEscape(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

type ActionRoot = Page | Frame | FrameLocator;

/**
 * Resolve an action root: page, named frame, or iframe by title (demo-core detail pane).
 */
export function resolveRoot(page: Page, frame?: FrameHint): ActionRoot {
  if (!frame) return page;

  if (frame.title) {
    return page.frameLocator(`iframe[title="${cssEscape(frame.title)}"]`);
  }
  if (frame.name) {
    const named = page.frame({ name: frame.name });
    if (named) return named;
    return page.frameLocator(`iframe[name="${cssEscape(frame.name)}"]`);
  }
  if (frame.urlPattern) {
    const matched = page.frames().find((fr) => new RegExp(frame.urlPattern!).test(fr.url()));
    if (matched) return matched;
  }
  return page;
}

function asLocator(root: ActionRoot, strategy: LocatorStrategy): Locator {
  const exact = "exact" in strategy ? strategy.exact : undefined;

  switch (strategy.kind) {
    case "a11y":
      return root.getByRole(strategy.role as "button", {
        name: strategy.name,
        exact: exact ?? false,
      });
    case "label":
      return root.getByLabel(strategy.text, { exact: exact ?? false });
    case "attribute": {
      if (strategy.attribute === "id" && looksGeneratedId(strategy.value)) {
        throw new Error(`Refusing generated id attribute: ${strategy.value}`);
      }
      const sel =
        strategy.attribute === "id"
          ? `#${cssEscape(strategy.value)}`
          : `[${strategy.attribute}="${cssEscape(strategy.value)}"]`;
      return root.locator(sel);
    }
    case "structural":
      return root.locator(strategy.css);
    case "visual":
      throw new Error("Visual locator strategy is discovery-only and not resolved in Phase 2");
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown strategy: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export type ResolveResult = {
  locator: Locator;
  resolvedBy: LocatorStrategyKind;
  strategy: LocatorStrategy;
};

function strategyRank(kind: LocatorStrategyKind): number {
  switch (kind) {
    case "a11y":
      return 1;
    case "label":
      return 2;
    case "attribute":
      return 3;
    case "structural":
      return 4;
    case "visual":
      return 5;
    default:
      return 99;
  }
}

/**
 * Resolve a multi-strategy locator in AGENTS.md §9.1 priority order.
 */
export async function resolveLocator(
  page: Page,
  target: MultiStrategyLocator,
  options?: { timeoutMs?: number },
): Promise<ResolveResult> {
  const timeout = options?.timeoutMs ?? 5_000;
  const errors: string[] = [];

  const ordered = [...target.strategies].sort(
    (a, b) => strategyRank(a.kind) - strategyRank(b.kind),
  );

  for (const strategy of ordered) {
    if (strategy.kind === "visual") {
      errors.push("visual: skipped (not implemented for production resolve)");
      continue;
    }
    try {
      const root = resolveRoot(page, strategy.frame);
      const locator = asLocator(root, strategy).first();
      await locator.waitFor({ state: "visible", timeout });
      return { locator, resolvedBy: strategy.kind, strategy };
    } catch (err) {
      errors.push(`${strategy.kind}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `Unable to resolve target "${target.id}" (${target.description ?? "no description"}). Tried:\n- ${errors.join("\n- ")}`,
  );
}

/** Test helper: order strategies would be attempted. */
export function orderedStrategyKinds(target: MultiStrategyLocator): LocatorStrategyKind[] {
  return [...target.strategies]
    .sort((a, b) => strategyRank(a.kind) - strategyRank(b.kind))
    .map((s) => s.kind);
}
