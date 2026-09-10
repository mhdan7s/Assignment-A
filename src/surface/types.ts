/**
 * SurfaceDriver contracts — PLAN Phase 2 / AGENTS.md §8–9.
 * Artifact actions reference these abstract types, never Playwright APIs.
 */

export type A11yNode = {
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  checked?: boolean | "mixed";
  expanded?: boolean;
  pressed?: boolean | "mixed";
  children?: A11yNode[];
};

export type Observation = {
  url: string;
  title: string;
  a11yTree: A11yNode | null;
  /** Compact aria snapshot string when available (model-friendly). */
  ariaSnapshot?: string;
  screenshotPath?: string;
  capturedAt: string;
};

export type ActionIntent =
  | { type: "navigate"; url: string }
  | { type: "click"; targetRef: string }
  | { type: "type"; targetRef: string; text: string; clear?: boolean }
  | { type: "select"; targetRef: string; value: string }
  | { type: "press"; key: string }
  | { type: "extract"; targetRef: string; outputKey: string }
  | { type: "wait"; spec: WaitSpec }
  | { type: "dismiss_dialog" }
  | { type: "accept_dialog" };

export type ActionResult = {
  ok: boolean;
  message?: string;
  extracted?: Record<string, unknown>;
  /** Which locator tier resolved the target, when applicable */
  resolvedBy?: LocatorStrategyKind;
};

export type WaitSpec =
  | { kind: "timeout"; ms: number }
  | { kind: "url"; pattern: string; timeoutMs: number }
  | { kind: "a11y"; role: string; name: string; timeoutMs: number };

export type CheckpointSpec = {
  description: string;
  urlPattern?: string;
  a11yIncludes?: Array<{ role?: string; name: string }>;
};

export type CheckpointResult = {
  passed: boolean;
  expected: string;
  observed: string;
};

export type EvidenceRefs = {
  screenshotPath?: string;
  a11yPath?: string;
  tracePath?: string;
};

/** Locator strategy kinds — resolve in this order (AGENTS.md §9.1). */
export type LocatorStrategyKind =
  | "a11y"
  | "label"
  | "attribute"
  | "structural"
  | "visual";

export type FrameHint = {
  name?: string;
  title?: string;
  urlPattern?: string;
};

export type LocatorStrategy =
  | {
      kind: "a11y";
      role: string;
      name: string;
      exact?: boolean;
      frame?: FrameHint;
    }
  | {
      kind: "label";
      text: string;
      exact?: boolean;
      frame?: FrameHint;
    }
  | {
      kind: "attribute";
      attribute: "name" | "id" | "placeholder";
      value: string;
      frame?: FrameHint;
    }
  | {
      kind: "structural";
      /** Relative CSS within page or frame — last resort before visual */
      css: string;
      frame?: FrameHint;
    }
  | {
      kind: "visual";
      /** Discovery-only / low confidence — not used for production resolve in v1 */
      note?: string;
      frame?: FrameHint;
    };

export type MultiStrategyLocator = {
  id: string;
  description?: string;
  strategies: LocatorStrategy[];
};

export type SurfaceSessionOwner = "automation" | "human" | "transferring";

export interface SurfaceDriver {
  readonly sessionId: string;
  readonly owner: SurfaceSessionOwner;
  observe(options?: { screenshot?: boolean; screenshotDir?: string }): Promise<Observation>;
  act(action: ActionIntent): Promise<ActionResult>;
  waitFor(condition: WaitSpec): Promise<void>;
  checkpoint(spec: CheckpointSpec): Promise<CheckpointResult>;
  captureEvidence(reason: string, dir?: string): Promise<EvidenceRefs>;
  pauseForHuman(): Promise<void>;
  resumeFromHuman(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Future adapters (design seam — not implemented in Phase 2):
 * - LegacyWebDriver: frameset traversal, table-cell targeting
 * - DesktopA11yDriver: OS accessibility APIs
 * Both should speak the same Observation / ActionIntent / MultiStrategyLocator contracts.
 */
export type SurfaceKind = "web" | "legacy_web" | "desktop";
