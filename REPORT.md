# Design Report

Short design write-up for the computer-use automation system. Sections match the take-home brief.

## 1. Architecture

Single-process TypeScript library + CLI. Seams:

| Module | Role |
|---|---|
| `surface` | `SurfaceDriver` / `PlaywrightWebDriver` — a11y-first perceive/act |
| `policy` | Allowlist + risk fail-closed + redaction; `beforeAct` gate |
| `artifact` | Zod capability contract (agent-invocable, not model transcripts) |
| `agent` + `llm` | Gemini discovery loop (LLM only here) |
| `replay` + `errors` | Deterministic executor + business/recoverable/hard taxonomy |
| `evidence` | `/evidence/<runId>/` bundles |
| `hitl` | Same-session HITL controller + mock operator console (`:4174`) |
| `apps/demo-core` | Hostile local bank proxy |

**Trade-off:** one process + clear modules over premature queues/microservices. Queues can wrap the CLI later without rewriting domain types.

## 2. Artifact schema

Focal contract (`src/artifact/schema.ts`, example `capabilities/lookup-savings/1.0.0.json`):

- `schemaVersion` / `capabilityVersion` / `id` / `name` / `description` — versioned, reviewable
- `appFamily` + `metadata.baseCapabilityId` / `tenantOverrides` — multi-tenant-ready without plumbing
- `surfaceKind` — web now; desktop/legacy later via same locator/action model
- `entry` — origin allowlist + start path
- `inputs` / `outputs` — JSON-Schema-like shapes for the calling agent
- `locators` — multi-strategy targets (a11y → label → attribute → structural → visual)
- `steps` — abstract ops + `targetRef` + `{ $input }` / `{ $env }` bindings (no raw model chat)
- `success` — checkpoint (URL + a11y assertions)
- `knownOutcomes` / `recoveries` — business outcomes vs bounded recoveries
- `policy` — risk level, approval, allowed actions, `approvedForUnattended`

Secrets use `$env` (e.g. `DEMO_CORE_PASSWORD`); `redactForArtifact` runs on save.

## 3. Determinism & error handling

Replay (`runReplay`) never calls the LLM. It validates inputs, opens the entry URL under policy, resolves locators in fixed tier order, executes steps, applies recoveries (bounded), then success checkpoint.

**Taxonomy:**
- **Business outcomes** — e.g. `NOT_FOUND` on unknown member → `status: business_outcome` (not a crash). Demonstrated in tests.
- **Recoverable** — e.g. system-notice interstitial → recorded recovery clicks.
- **Hard failures** — unresolved target / policy / checkpoint miss → step id + expected vs observed + screenshot/a11y evidence.

Secondary UI drift: multi-strategy locators + checkpoints; not ML healing.

## 4. Heterogeneity & multi-tenant

Web adapter implemented. `LegacyWebDriver` / `DesktopA11yDriver` would implement the same `SurfaceDriver` + locator contracts. Cross-tenant: share `appFamily` artifacts; specialize via `tenantOverrides` / locator overlays; drift → structured failure or HITL, not silent re-reasoning.

## 5. Escalation & handoff

**Control owner state machine:** `automation → transferring → human → transferring → automation` (or abort).

**Mechanism (real, minimal UI):**
1. `HitlController.escalate` builds an `InterventionRequest` (reason, goal, step, observation, screenshot).
2. `PlaywrightWebDriver.pauseForHuman()` — **same** `sessionId` / browser context stays alive; automation acts are blocked.
3. Mock operator console (`startOperatorServer`, default `http://127.0.0.1:4174`) shows context + screenshot and **Resume / Abort** (also `/api/resume` for tests).
4. Human uses the **live headed browser** for manual steps; best-effort click/key/nav recording via page bindings.
5. Resume → `resumeFromHuman()` → automation continues on the identical session.

Not in scope: full co-browse/WebRTC operator product. The seam (pause / cede / resume / ownership) is real.

Demo: `npm run hitl:demo` (or `hitl-mock --auto-resume-ms=500` for CI).

## 6. Safety

`PolicyEngine` before every act: origin/path allowlists, denied actions (`eval`, …), irreversible fail-closed unless approved+allowlisted, step/time budgets. Logger + `redactDeep` strip secrets. Demo data only.

## 7. Cuts

**Done:** demo-core, SurfaceDriver, policy, artifact schema, golden capability, deterministic replay + outcomes, evidence writer, Gemini discovery, HITL same-session handoff + mock operator UI, CI.

**Thin / next:** live discovery evidence under `/evidence/` still needs a real `GEMINI_API_KEY` run; password-field screenshot masking; capability catalog HTTP API (stretch).
