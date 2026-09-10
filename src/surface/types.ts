/**
 * SurfaceDriver contract sketch (PLAN Phase 2).
 * Full PlaywrightWebDriver lands in Phase 2 — this file only freezes the seam.
 */

export type Observation = {
  url: string;
  title: string;
  a11yTree: unknown;
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

export interface SurfaceDriver {
  readonly sessionId: string;
  observe(): Promise<Observation>;
  act(action: ActionIntent): Promise<ActionResult>;
  waitFor(condition: WaitSpec): Promise<void>;
  checkpoint(spec: CheckpointSpec): Promise<CheckpointResult>;
  captureEvidence(reason: string): Promise<EvidenceRefs>;
  pauseForHuman(): Promise<void>;
  resumeFromHuman(): Promise<void>;
  dispose(): Promise<void>;
}
