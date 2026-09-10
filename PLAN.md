# Computer-Use Automation System — Comprehensive Build Plan

**Source of truth:** `Assignment A - Computer-Use Automation System.pdf` (interface.ai Engineering take-home)  
**Companion rules:** [`AGENTS.md`](./AGENTS.md)  
**Goal of this plan:** Deliver a small, correct, well-argued **vertical slice** that touches every Section 3 must-have — not a polished product and not premature scale infrastructure.

---

## Locked decisions (defensible defaults)

These override the “your call” list in Section 4 with explicit choices. Change only with a write-up update in `REPORT.md`.

| Decision | Choice | Why |
|---|---|---|
| Language | **TypeScript (Node 20+)** | End-to-end typing for capability schemas; first-class Playwright; Zod mirrors JSON Schema cleanly for agent contracts |
| Schema validation | **Zod** | Strict runtime validation of artifacts, params, outputs, policy, and LLM structured outputs |
| Browser / computer-use | **Playwright** | Accessibility snapshots, persistent browser contexts (HITL same-session), CDP, traces/screenshots |
| Primary perception | **Accessibility tree** (+ screenshot evidence; DOM as fallback locator tier) | Matches “no clean DOM” reality; portable seam toward desktop a11y later |
| LLM | **Gemini 2.5 Flash** (default), **Pro** optional for hard discovery | Cost-effective, structured outputs, multimodal screenshots, function calling |
| Architecture | **Single-process modular library + CLI** | Appropriate simplicity; clear package seams so queues/multi-tenant can attach later without rewrite |
| Proxy target | **Local intentionally hostile demo bank app** (`apps/demo-core`) | Reproducible, no ToS risk, no real credentials/PII, can inject validation/not-found/dialog/timeout states |
| Operator UI | **Minimal mock operator surface** | Real pause/cede/resume + same live session; full co-browse console out of scope |
| Desktop / multi-tenant plumbing | **Design only** (Section 3.7) | Abstractions must not paint into a corner; do not build clusters/queues |

**Non-negotiable from the brief:** At least one **genuine LLM-driven discovery run** against a live surface, with evidence under `/evidence/`.

---

## Evaluation alignment (build to the rubric, not past it)

Weight order from Section 7 — every phase must serve these:

1. System design (boundaries, artifact schema, replay contract)
2. Correctness of the core loop (real goal → artifact → deterministic replay)
3. Robustness & error handling (business outcomes vs recoverable vs hard failures)
4. Human-in-the-loop escalation (real control transfer, not a TODO)
5. Generalization story (heterogeneous surfaces + multi-tenant reuse)
6. Safety & data handling
7. Code quality
8. Communication (`REPORT.md`)

**Anti-goals:** Feature breadth, framework name-dropping, building scaling infrastructure (queues, clusters, multi-tenant plumbing). Design abstractions that *could* scale; do not implement that infrastructure now.

---

## End-to-end vertical slice (acceptance thread)

The system is “done enough” only when this thread works:

```
goal + target
  → LLM observe→decide→act discovery run (live UI)
  → typed, versioned capability artifact (no raw model transcript)
  → deterministic replay with params + outputs + checkpoints
  → error/outcome taxonomy exercised (incl. one exceptional-state replay)
  → HITL path: stuck → intervention request → human takes live session → resume
  → evidence for discovery + replay under /evidence/
  → allowlist + redaction enforced throughout
```

---

# Phase 0 — Problem framing & success criteria

### Objectives
- Internalize: **model discovers → artifact becomes capability → deterministic replay is production path**.
- Agent-facing product decides *what*; this system decides *how safely and reliably* inside legacy UIs.
- API integrations are **out of scope**; UI driving is the product.

### Environment realities that shape every design choice
1. **Stable UIs, real runtime errors** — optimize for validation errors, not-found, permission denials, unexpected dialogs, session expiry, transient slowness, app errors — not constant layout drift.
2. **Heterogeneous surfaces** — modern web, legacy web (framesets, nested tables, non-semantic markup, no test IDs), native desktop. Do not assume clean DOM / stable CSS selectors / APIs.
3. **Multi-tenant at scale** — hundreds of institutions × ~20 apps; many share a vendor product with different config/branding/version. Prefer reusable base artifacts + overlays over per-tenant re-recording.

### Exit criteria
- [ ] Team/agent agrees on locked decisions table above
- [ ] Vertical-slice acceptance checklist written into `AGENTS.md` and this plan
- [ ] Explicit cut list drafted (what is stubbed vs real)

---

# Phase 1 — Repository scaffolding & boundaries

### Objectives
Create a runnable monorepo-shaped layout that makes seams obvious and submission paths exact.

### Proposed layout

```
/
  AGENTS.md                 # Always-on engineering & product rules
  PLAN.md                   # This plan
  README.md                 # Setup, demo commands, keys/config
  REPORT.md                 # Required 7-section design write-up
  package.json
  tsconfig.json
  .env.example
  .gitignore
  apps/
    demo-core/              # Local hostile proxy bank UI
  packages/ or src/
    surface/                # SurfaceDriver abstraction (web now)
    policy/                 # Allowlists, action risk classes, redaction
    agent/                  # Discovery loop (LLM in the loop)
    artifact/               # Zod schemas, versioning, I/O contracts
    replay/                 # Deterministic executor
    errors/                 # Outcome taxonomy
    hitl/                   # Pause / control transfer / resume
    evidence/               # Structured logs, screenshots, traces
    llm/                    # Gemini client + structured tool calling
    cli/                    # discover / replay / hitl commands
  capabilities/             # Saved artifacts (versioned JSON)
  evidence/                 # Required submission evidence
  tests/
```

### Deliverable path constraints (exact)
- `/README.md` — setup, run with/without live services, demo commands
- `/REPORT.md` — seven headings exactly as specified
- `/evidence/` — discovery + replay logs, example artifact, ideally one exceptional replay

### Dependencies (initial)
- `playwright`, `@playwright/test` (tests only where useful)
- `zod`, `zod-to-json-schema` (for LLM structured outputs if needed)
- `@google/generative-ai` or official Gemini SDK
- `pino` or similar structured logger (with redaction hooks)
- `dotenv`, `commander`/`cac` for CLI
- `express` or `vite` static server for demo-core + minimal operator mock

### Exit criteria
- [ ] `pnpm/npm install` works
- [ ] CLI stubs: `discover`, `replay`, `hitl-mock`
- [ ] Secrets only via env; `.env` gitignored
- [ ] TypeScript strict mode on

---

# Phase 2 — Surface abstraction (computer-use seam)

### Objectives
Define the seam between **“how we perceive/act on a surface”** and **“the recorded flow”** so web → legacy web → desktop is an adapter swap, not an artifact rewrite.

### Core interface (conceptual)

```ts
interface SurfaceDriver {
  sessionId: string;
  observe(): Promise<Observation>;      // a11y tree (+ optional screenshot/DOM digest)
  act(action: ActionIntent): Promise<ActionResult>;
  waitFor(condition: WaitSpec): Promise<void>;
  checkpoint(spec: CheckpointSpec): Promise<CheckpointResult>;
  captureEvidence(reason: string): Promise<EvidenceRefs>;
  pauseForHuman(): Promise<void>;        // keep session alive
  resumeFromHuman(): Promise<void>;
  dispose(): Promise<void>;
}
```

### Observation model
Prefer **accessibility snapshot** as the primary model-facing state:
- Roles, names, values, states (disabled, expanded, checked)
- Hierarchical structure suitable for LLM reasoning without raw HTML noise
- Screenshot attached for multimodal fallback and failure evidence
- Optional compact DOM digest only when a11y is insufficient (legacy quirks)

### Action model (policy-checked before execution)
- `navigate`, `click`, `type`, `select`, `press`, `hover` (if needed), `scroll_into_view`
- `extract` (read text/value from a target)
- `dismiss_dialog` / `accept_dialog` (explicit, never implicit)
- `wait` (network idle / selector/a11y condition / timeout — bounded)
- **No** unconstrained JS eval in production path unless allowlisted and logged

### Locator strategy (robustness tiers — record & replay)
Artifacts must store **multi-strategy targets**, ranked:

1. **Accessibility identity** — role + accessible name (+ optional value/state)
2. **Semantic hints** — label text, heading context, table row key
3. **Stable attributes** if present — `name`, `id` only when not generated noise
4. **Structural path within a11y tree** — relative, not absolute DOM xpath-as-first-choice
5. **Visual/spatial fallback** — bounding box + screenshot hash (discovery only / last resort; mark low confidence)

**Do not** rely on test IDs (legacy apps essentially never have them).  
**Do not** treat brittle CSS/XPath as the sole identifier.

### Session model
- Persistent Playwright **browser context + page** per run
- Session ownership state: `automation | human | transferring`
- HITL must attach to the **same** live session (CDP / debugging port / shared context), never a fresh browser

### Implementation focus this phase
- `PlaywrightWebDriver` implementing `SurfaceDriver`
- Local demo app reachable via driver
- Unit-ish tests for locator resolution order

### Exit criteria
- [ ] Driver can open demo app, observe a11y tree, click/type, screenshot
- [ ] Artifact action types reference abstract actions, not Playwright APIs directly
- [ ] Documented extension path for `LegacyWebDriver` and `DesktopA11yDriver` in REPORT §4

---

# Phase 3 — Safety & policy guardrails (first-class, not bolted on)

### Objectives
Enforce configurable allowlists and risk classes **before every act**, in both discovery and replay. Never persist secrets or raw sensitive data.

### Policy configuration (example shape)
```yaml
allowedOrigins: ["http://127.0.0.1:4173"]
allowedPathPrefixes: ["/login", "/members", "/accounts"]
allowedActions: [navigate, click, type, select, extract, wait, dismiss_dialog]
deniedActions: [download, file_upload, eval, os_shell]
maxSteps: 40
maxRuntimeMs: 180000
risk:
  irreversible: [submit_transfer, delete_record, close_account, confirm_payment]
  requiresHumanApproval: [submit_transfer, delete_record]
  safeReversible: [navigate, click_nav, type_search, extract]
```

### Enforcement points
1. **Pre-act gate** in SurfaceDriver or PolicyMiddleware
2. **Navigation gate** — block off-allowlist origins/routes
3. **Artifact emission gate** — redact params/outputs/logs
4. **Replay gate** — same policy; capability cannot widen permissions silently

### Risk handling decision (locked for v1)
- **Safe/reversible:** auto-allow if allowlisted
- **Risky/irreversible:** **block in unattended discovery/replay** unless capability metadata marks `approvedForUnattended: true` *and* policy allows; otherwise escalate HITL or fail closed
- Justify in REPORT §6: financial back-office bias = fail closed > optimistic proceed

### Redaction rules
- Never write to artifacts/logs: passwords, tokens, session cookies, full SSN/PAN, raw account numbers beyond last-4 if needed for demo
- Parameterize sensitive fields as `${input.memberId}` references, not literals, when possible
- Evidence screenshots: prefer masked regions for password fields; if full-page screenshot unavoidable in demo, ensure demo data is synthetic only
- Structured logger redaction paths: `*.password`, `*.token`, `*.ssn`, `*.pan`, `authorization`, `cookie`

### Exit criteria
- [ ] Attempted off-allowlist navigation fails with structured policy error
- [ ] Irreversible action without approval escalates or hard-fails
- [ ] Secrets absent from sample artifacts and evidence logs

---

# Phase 4 — Goal-driven discovery agent loop (LLM in the loop)

### Objectives
Satisfy §3.1: accept `goal + target`, run observe → decide → act until goal met or stop condition.

### Inputs
```ts
{
  goal: string;
  target: { kind: "url"; url: string } | { kind: "app"; appId: string; entry: string };
  params?: Record<string, unknown>; // optional hints, not always used in discovery
  policyRef: string;
  maxSteps: number;
  timeoutMs: number;
}
```

### Loop algorithm
1. Init surface session + evidence run id
2. Observe → build model context (goal, compact a11y, last actions, policy summary)
3. LLM returns **structured** next action(s) or `declare_success` / `declare_stuck`
4. Policy check → act → record step (action, target resolution, observation digest, rationale)
5. Repeat until:
   - success checkpoint satisfied
   - `maxSteps` / timeout
   - policy block
   - model declares stuck / repeated no-progress → HITL escalation
6. On success: compile transcript → **capability artifact** (decoupled from raw model chatter)
7. Persist evidence under `evidence/<runId>/`

### Prompting & tool design
- Prefer **function/tool calling** with Zod-validated tool schemas over freeform JSON
- Tools map 1:1 to allowlisted `ActionIntent`s + `declare_success` + `declare_stuck` + `extract_field`
- Keep context window tight: diff/delta observations when possible; avoid dumping full HTML
- Multimodal: attach screenshot on ambiguity or N consecutive failed target resolutions
- Model never receives secrets; credentials for demo login injected by harness as env/test fixtures if needed, not by the model inventing them

### Stopping / stuck detection
- Same action + same observation hash ≥ K times
- No checkpoint progress metric for M steps
- Unresolvable target after fallbacks
- Unexpected modal not in known recovery catalog
- Policy denial

### Exit criteria
- [ ] One real Gemini-driven run completes a multi-step goal on demo-core
- [ ] Run log + screenshots in `/evidence/`
- [ ] Raw model transcript **not** treated as the capability artifact

---

# Phase 5 — Structured capability artifact (focal evaluation point)

### Objectives
§3.2: typed, serializable, versioned, reviewable capability with clear agent-facing contract.

### Design principles
- **Contract first:** name, description, input schema, output schema, success semantics
- **Decoupled from discovery:** no chain-of-thought required to run
- **Parameterized:** member IDs etc. as inputs, not hardcoded
- **Reviewable by human and calling agent**
- **Versioned:** `schemaVersion` + `capabilityVersion`
- **Multi-tenant-ready fields** even if single-tenant in v1: `appFamily`, `baseCapabilityId`, `tenantOverrides`

### Proposed artifact schema (conceptual — finalize in Zod)

```ts
CapabilityArtifact = {
  schemaVersion: "1.0.0",
  id: string,                         // ulid/uuid
  name: string,                       // agent-invocable name
  description: string,                // human + agent readable
  capabilityVersion: semver,
  appFamily: string,                  // e.g. "demo-core-banking"
  surfaceKind: "web" | "legacy_web" | "desktop",
  entry: { originAllowlist: string[], startPath: string },
  inputs: ZodJSONSchema,              // e.g. { memberId: string }
  outputs: ZodJSONSchema,             // e.g. { savingsBalance: Money }
  steps: Step[],                      // ordered
  success: CheckpointSpec,            // final checkpoint
  knownOutcomes: OutcomeDetector[],   // business outcomes
  recoveries: RecoveryRule[],         // dialog dismiss, retry wait, etc.
  policy: { riskLevel, requiresApproval, allowedActions },
  metadata: { createdAt, sourceRunId, author, approvalState },
  locators: Record<TargetId, MultiStrategyLocator>,
}
```

### Step model
Each step includes:
- `op`: abstract action
- `targetRef`: key into locators map
- `args`: literals or `{ $input: "memberId" }` bindings
- `postconditions?`: optional mid-flow checkpoints
- `on`: branching hooks for known outcomes (keep minimal but real)

### Compilation from discovery
- Map resolved successful targets → multi-strategy locators
- Lift literal typed values that match goal params → input bindings
- Drop exploratory dead-ends; keep successful path + detected recoveries
- Generate description via template + optional LLM summarizer (summary only; not required for replay)

### Storage
- `capabilities/<name>/<version>.json`
- Validate on read/write with Zod
- Optional: emit JSON Schema for external agents

### Exit criteria
- [ ] Zod schemas cover artifact, step, locator, checkpoint, result
- [ ] Successful discovery emits valid artifact
- [ ] Artifact understandable without reading model logs
- [ ] REPORT §2 explains every major field

---

# Phase 6 — Deterministic replay engine (production path)

### Objectives
§3.3: given artifact + params, replay **without LLM decisions**; stable targeting; verify checkpoints; return outputs.

### Algorithm
1. Validate params against `inputs` schema
2. Open surface at entry (policy-checked)
3. For each step:
   - Resolve locator via tiered strategy
   - Apply waits (explicit in step / intelligent but deterministic wait helpers — **no model**)
   - Execute action
   - Evaluate known outcome detectors
   - Evaluate recoveries if matched (bounded)
   - Evaluate step postcondition if any
4. Evaluate final success checkpoint
5. Extract declared outputs
6. Return structured `ReplayResult`

### Determinism rules
- Same artifact + same params + healthy app → same step sequence
- No LLM in decision loop (stretch “assisted fallback” is optional and bounded later)
- Timeouts are explicit; avoid unbounded sleeps
- Network waits are capped
- Locator fallback order is fixed and logged

### Result contract (must distinguish)
```ts
ReplayResult =
  | { status: "success"; outputs: OutputMap; evidence: ... }
  | { status: "business_outcome"; code: "NOT_FOUND" | "VALIDATION_ERROR" | "PERMISSION_DENIED" | ...;
      message: string; outputs?: Partial<...>; evidence: ... }
  | { status: "failed"; error: {
      stepId, expected, observed, category: "hard_failure" | "policy_violation" | "timeout" | ...,
    }; evidence: ... }
  | { status: "needs_human"; intervention: InterventionRequest }
```

### Exit criteria
- [ ] Replay CLI runs artifact without Gemini calls
- [ ] Outputs match schema on happy path
- [ ] Checkpoint failure yields debuggable structured error

---

# Phase 7 — Error taxonomy & exceptional-state handling

### Objectives
Make replay production-useful beyond happy path — the brief’s hard part.

### Three-way taxonomy (non-negotiable)

| Class | Examples | System response |
|---|---|---|
| **Expected business outcomes** | no such member, validation rejected, permission denied | Return `business_outcome` to caller; not a crash |
| **Recoverable conditions** | known interstitial, transient spinner/slowness, stale session with re-login policy if allowlisted | Bounded recovery rules; then continue |
| **Hard failures** | unknown dialog, target unresolved, crash page, unexpected navigation off-flow | Stop; structured error; evidence capture; optional HITL |

### Detector design
- Declarative matchers on a11y text/role, URL patterns, dialog titles
- Attached to artifact (`knownOutcomes`, `recoveries`) and/or global appFamily defaults
- Demo-core **injects** failures for evidence (bad member id, forced 500, session expiry button)

### Evidence on failure
At least one rich signal: screenshot **and** a11y snapshot digest + step index + expected vs observed

### Exit criteria
- [ ] Evidence includes a replay hitting NOT_FOUND or validation error
- [ ] Caller-visible distinction between business outcome and hard failure
- [ ] REPORT §3 documents detectors + examples

---

# Phase 8 — Observability & evidence packaging

### Objectives
§3.5 + deliverable §6.3.

### Per-run evidence bundle
```
evidence/<runId>/
  meta.json          # goal, mode=discover|replay, timestamps, model, artifact id
  events.jsonl       # structured steps: observe/decide/act or replay steps
  screenshots/       # failure + key checkpoints
  a11y/              # snapshots on failure / stuck
  trace.zip          # Playwright trace optional but valuable
  result.json        # final contract
```

### Logging rules
- Structured JSON logs
- Include *why* on discovery decisions (short rationale fields from tool calls)
- Redaction applied before write
- Correlation ids: `runId`, `sessionId`, `capabilityId`, `stepId`

### Exit criteria
- [ ] Discovery + replay bundles exist for demo path
- [ ] README points to exact folders
- [ ] Failure bundle includes richer signal

---

# Phase 9 — Human-in-the-loop escalation & handoff

### Objectives
§3.6: detect stuck/blocked; route intervention with context; human operates **same live session**; hand control back; record human actions. Full co-browse console out of scope — minimal but real.

### Control-transfer model
```ts
enum ControlOwner { Automation, Human, Transferring }

InterventionRequest = {
  id, runId, sessionId,
  reason: "stuck_discovery" | "unrecoverable_replay" | "risky_action" | "policy",
  capabilityOrGoal, stepId,
  observationSummary, screenshotRef,
  instructionsForHuman,
  createdAt
}
```

### Mechanism (real)
1. Automation sets owner → `Transferring`, pauses act loop, keeps browser context alive
2. Expose session via:
   - Playwright persistent context + local **operator mock page** that shows screenshot stream / last a11y + “Resume” / “Fail run”, **or**
   - Connect over CDP endpoint for headed browser takeover (document which)
3. Human performs manual steps in the live browser window (headed mode)
4. Optional: record human actions via Playwright listener / CDP (best-effort; document limits)
5. Human signals resume → owner `Automation` → continue from next step or re-checkpoint
6. Persist intervention + human action summary into evidence

### Mock deliberately
- Operator UI can be bare (HTML form: reason display, resume/abort buttons)
- Do **not** fake the control transfer — session identity must be preserved

### Exit criteria
- [ ] Forced stuck path creates InterventionRequest
- [ ] Human can interact with same browser session
- [ ] Resume continues run or cleanly completes
- [ ] Evidence shows handoff boundary events
- [ ] REPORT §5 explains owner state machine

---

# Phase 10 — Heterogeneity & multi-tenant design (design-depth, build-thin)

### Objectives
§3.7 + REPORT §4. Implement one surface; design so abstractions don’t corner you.

### Surface generalization story
- Artifact steps reference **abstract ops + locator contracts**
- `SurfaceDriver` adapters:
  - Web A11y (implemented)
  - Legacy web (frames/iframe traversal, table-cell targeting) — stub interface + notes
  - Desktop UI Automation / OS a11y — stub interface + notes
- Perception/action adapters convert to the same `Observation` / `ActionIntent`

### Multi-tenant reuse story
- `appFamily` + `baseCapabilityId` + `tenantId` overlay packs
- Canonicalize routes: `/members/12345` → `/members/:memberId`
- Tenant overlays: branding-specific locators, extra interstitial recoveries, version pins
- Drift detection (design): locator confidence scores, canary replays, screenshot/a11y structural hash diffs per tenant version
- Graceful degrade: base artifact → overlay miss → HITL or bounded re-discovery for one step (stretch)

### Exit criteria
- [ ] Schema fields exist for appFamily / overlays even if single tenant used
- [ ] REPORT §4 is concrete (not hand-wavy)

---

# Phase 11 — Demo target application (proxy bank)

### Objectives
Multi-step flow that exercises interesting problems without real bank access.

### Demo-core flows (minimum)
1. Login with **synthetic** credentials (local only)
2. Search member by ID
3. Open member detail
4. Read savings balance **or** open sub-account wizard → confirmation screen
5. Injectible states:
   - unknown member → not found message
   - validation error on empty required field
   - permission denied banner
   - random interstitial (“system notice”) 
   - session expiry modal
   - slow endpoint toggle

### Hostility features (legacy realism)
- Table-based layout, minimal semantics, iframes for detail pane, unstable auto-ids, no test IDs
- Still expose decent a11y names where a real bank might (labels) so a11y-first strategy is meaningful

### Exit criteria
- [ ] Goal examples from brief are expressible against demo-core
- [ ] Exceptional states triggerable for evidence

---

# Phase 12 — CLI, API seams & developer UX

### Commands (demo path must be exact in README)
```bash
# start demo app
npm run demo:core

# discovery (live LLM)
npm run discover -- --goal "Look up member 12345 and read savings balance" --target http://127.0.0.1:4173

# replay
npm run replay -- --artifact capabilities/lookup-savings/1.0.0.json --input '{"memberId":"12345"}'

# replay exceptional
npm run replay -- --artifact ... --input '{"memberId":"NOPE"}'

# hitl demo
npm run hitl:demo -- --run <runId>
```

### Optional thin HTTP facade (only if time)
`POST /capabilities/:name/invoke` — stretch goal “agent-facing capability interface”

### Offline / no-live-services mode
- Replay + policy unit tests run without Gemini
- Discovery requires `GEMINI_API_KEY`
- Document both paths in README

### Exit criteria
- [ ] README demo path copy-pastable
- [ ] Replay works offline

---

# Phase 13 — Testing strategy (where it counts)

### Priorities
1. Zod artifact validation / migration assumptions
2. Locator resolution order
3. Policy allowlist & redaction
4. Replay outcome taxonomy against demo-core fixtures
5. Control-owner state machine

### Deliberately light
- Visual snapshot sprawl
- Full e2e of Gemini (keep one recorded evidence run instead)
- Load/perf tests

### Exit criteria
- [ ] `npm test` covers policy, schema, taxonomy, locator basics
- [ ] One scripted replay integration test against demo-core (no LLM)

---

# Phase 14 — Documentation deliverables

### README.md
- Setup (Node version, `npm i`, `npx playwright install`, env vars)
- Running demo-core
- Discovery + replay commands
- Running without live LLM
- Where evidence lives
- Safety notes (synthetic data only)

### REPORT.md (exact seven headings)
1. Architecture  
2. Artifact schema  
3. Determinism & error handling  
4. Heterogeneity & multi-tenant  
5. Escalation & handoff  
6. Safety  
7. Cuts  

Length ~1–3 pages — dense, decision-focused, trade-offs explicit.

### Exit criteria
- [ ] Headings match brief exactly
- [ ] Every locked decision defended
- [ ] Cuts + next steps listed

---

# Phase 15 — Evidence capture & submission hygiene

### Required evidence
- Saved example capability artifact
- Discovery run logs (+ screenshots/trace)
- Replay run logs (success)
- Ideally replay exceptional-state result
- Optional short screen recording

### Ground rules checklist
- [ ] No real bank systems / real credentials / real PII
- [ ] No secrets in git
- [ ] Public GitHub repo
- [ ] Email link to `assignments@interface.ai` (human submitter), URL on own line

### Exit criteria
- [ ] `/evidence/` complete enough to prove real discovery happened
- [ ] Fresh clone + README path works on a clean machine

---

# Phase 16 — Optional stretch (at most 1–2, only after solid core)

Pick based on ROI for this submission:

1. **Agent-facing capability catalog** — list + invoke by name with typed args (high alignment with “capability” framing)  
2. **Canonicalization / cross-tenant reuse** — base artifact + second branded variant with overlays (high alignment with §3.7)  
3. Confidence & approval states (`draft → approved`)  
4. Bounded assisted LLM fallback on single replay step  
5. Emit Playwright test from artifact  
6. Multi-run stability score  

**Default recommendation:** (1) or (2), not both unless core is airtight.

---

## Implementation order (execution sequence)

| Step | Phase | Rationale |
|---|---|---|
| 1 | 0–1 | Scaffold + rules |
| 2 | 11 | Demo-core first so everything has a target |
| 3 | 2–3 | Surface + policy before agent |
| 4 | 5 | Artifact schema early (focal point) |
| 5 | 4 | Discovery loop emitting artifacts |
| 6 | 6–7 | Replay + taxonomy |
| 7 | 8 | Evidence packaging |
| 8 | 9 | HITL handoff |
| 9 | 12–13 | CLI polish + tests |
| 10 | 10+14 | Design write-up for heterogeneity/tenancy |
| 11 | 15 | Evidence + README final |
| 12 | 16 | Stretch only if time |

---

## Cut lines (intentional thinness)

| Area | Approach |
|---|---|
| Operator console | Mock UI; real session control transfer |
| Desktop automation | Design + interface stub only |
| Multi-tenant runtime | Schema + REPORT; no tenant plumbing service |
| Queues/workers/K8s | Not built |
| Assisted LLM replay fallback | Stretch only |
| Perfect locator ML | Tiered heuristics only |
| Co-browsing WebRTC | Out of scope |

---

## Definition of Done (project-level)

1. All Section 3 must-haves present in a thin-but-real form  
2. Genuine LLM discovery evidence on disk  
3. Deterministic replay with params/outputs/checkpoints  
4. Exceptional-state replay demonstrated  
5. HITL same-session handoff demonstrated  
6. Allowlist + redaction enforced  
7. `README.md` + `REPORT.md` + `/evidence/` complete  
8. `AGENTS.md` governs future agents working on the repo  

---

## Next action after this plan

Implement in the order above, continuously validating against the vertical-slice acceptance thread and `AGENTS.md` invariants.
