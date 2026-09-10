# Design Report

Short design write-up for the computer-use automation system. Sections match the take-home brief exactly. Bodies fill in as implementation deepens beyond Phase 1.

## 1. Architecture

_TBD — single-process modular TypeScript library + CLI; seams for surface, policy, discovery, artifact, replay, HITL, evidence (see `AGENTS.md` §8 and `PLAN.md`)._

## 2. Artifact schema

_TBD — Zod-validated, versioned capability contract with steps, multi-strategy locators, typed inputs/outputs, checkpoints. Phase 1 only has a minimal `schemaVersion` stub in `src/artifact/schema.ts`._

## 3. Determinism & error handling

_TBD — deterministic replay without LLM decisions; business outcomes vs recoverable conditions vs hard failures (`src/errors`)._

## 4. Heterogeneity & multi-tenant

_TBD — `SurfaceDriver` adapter seam for web / legacy web / desktop; `appFamily` + overlays for cross-tenant reuse (design-depth, build-thin)._

## 5. Escalation & handoff

_TBD — detect stuck; `InterventionRequest`; same live session control transfer; `ControlOwner` state machine (`src/hitl`)._

## 6. Safety

_TBD — allowlist origins/actions; risk classes fail-closed for irreversible actions; redaction in logger/artifacts (`src/policy`, `src/shared/logger.ts`)._

## 7. Cuts

_Phase 1 scaffolding only. Intentional stubs: discovery, replay, HITL, policy enforcement, full demo-core UI, real evidence bundles. Next: Phase 11 demo-core flows, then Phase 2 SurfaceDriver + Phase 3 policy (see `PLAN.md` execution order)._
