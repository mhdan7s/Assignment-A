/**
 * Surface perception/action seam — PLAN Phase 2 / AGENTS.md §8.1.
 * Implementations must not leak Playwright types into artifacts.
 */
export type {
  A11yNode,
  ActionIntent,
  ActionResult,
  CheckpointResult,
  CheckpointSpec,
  EvidenceRefs,
  FrameHint,
  LocatorStrategy,
  LocatorStrategyKind,
  MultiStrategyLocator,
  Observation,
  SurfaceDriver,
  SurfaceKind,
  SurfaceSessionOwner,
  WaitSpec,
} from "./types.js";

export {
  looksGeneratedId,
  orderedStrategyKinds,
  resolveLocator,
  resolveRoot,
} from "./locators.js";

export {
  PlaywrightWebDriver,
  type PlaywrightWebDriverOptions,
} from "./playwrightWebDriver.js";
