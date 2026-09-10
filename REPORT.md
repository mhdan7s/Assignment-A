# Design Report

Short design write-up for the computer-use automation system. Sections match the take-home brief exactly. Bodies fill in as implementation deepens.

## 1. Architecture

_TBD — single-process modular TypeScript library + CLI; seams for surface, policy, discovery, artifact, replay, HITL, evidence (see `AGENTS.md` §8)._

## 2. Artifact schema

_TBD — Zod-validated, versioned capability contract with steps, multi-strategy locators, typed inputs/outputs, checkpoints. Phase 1 only has a minimal `schemaVersion` stub in `src/artifact/schema.ts`._

## 3. Determinism & error handling

_TBD — deterministic replay without LLM decisions; business outcomes vs recoverable conditions vs hard failures (`src/errors`)._

## 4. Heterogeneity & multi-tenant

**Surface seam (implemented for web):** `SurfaceDriver` speaks abstract `Observation`, `ActionIntent`, and `MultiStrategyLocator` only. `PlaywrightWebDriver` is one adapter; artifacts never import Playwright types.

**Extension path:**
- `LegacyWebDriver` (future) — same contracts; adds frameset/iframe traversal helpers and table-cell semantic strategies while still emitting `a11y` / `label` / `attribute` / `structural` locator tiers.
- `DesktopA11yDriver` (future) — OS accessibility tree → same `Observation` / `ActionIntent`; locators prefer role+name (tier 1) which ports cleanly from web a11y.

**Multi-tenant (design, not built):** capabilities will carry `appFamily` + optional overlays so the same recorded flow can specialize locators/recoveries per institution without re-recording. Drift → structured failure / HITL, not silent LLM wandering.

## 5. Escalation & handoff

_Partial — `PlaywrightWebDriver` owns `automation | human | transferring` and keeps the same browser context across `pauseForHuman` / `resumeFromHuman`. Full InterventionRequest routing + operator mock lands in Phase 9._

## 6. Safety

_TBD — allowlist origins/actions; risk classes fail-closed for irreversible actions; redaction in logger/artifacts. Phase 3 plugs `beforeAct` on the surface driver._

## 7. Cuts

_Done: Phase 1 scaffold, Phase 11 demo-core, Phase 2 SurfaceDriver (web). Still stubbed: policy enforcement, discovery agent, replay engine, full HITL operator path, real evidence bundles for submission. Next: Phase 3 policy._
