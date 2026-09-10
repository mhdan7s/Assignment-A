# AGENTS.md — Computer-Use Automation System

This file is the **always-on contract** for any human or AI agent working in this repository. It encodes the interface.ai take-home brief (*Computer-Use Automation System*), the locked engineering decisions, and the non-negotiable product/security/scalability rules. If a local convenience conflicts with this file, **this file wins** unless `REPORT.md` is updated with an explicit decision change.

**Related docs:** `PLAN.md` (phased build plan), `README.md` (how to run), `REPORT.md` (design rationale), `Assignment A - Computer-Use Automation System.pdf` (original brief).

---

## 1. Mission & product framing

### 1.1 What we are building
A **backend integration layer** that gives AI agents “hands” for **banks and credit unions**: operate institution back-office applications that **have no API**, by driving the UI the way a human operator would.

### 1.2 The through-line (never violate)
1. **The model discovers** — LLM computer-use figures out how to accomplish a goal the first time.
2. **The artifact becomes a reusable capability** — typed, versioned, reviewable, parameterized; decoupled from the raw model transcript.
3. **Deterministic replay is production** — AI agents invoke capabilities on demand **without** re-reasoning about the UI every time.

Framed differently: the agent-facing product decides **what** to do; **this system** is how it **reliably and safely** does it inside legacy bank software.

### 1.3 Explicitly out of scope
- Integrating systems that already expose a suitable **API** (API is always preferred; not this project).
- Automating **real** bank/credit-union production systems.
- Using **real** customer credentials or **real** PII/financial data.
- Building a polished full operator co-browsing product.
- Building scaling infrastructure (queues, clusters, multi-tenant control planes) prematurely.
- Feature breadth for its own sake.

### 1.4 What “done” means here
A **complete end-to-end vertical slice** touching **every** core requirement in brief Section 3 — thin-but-real — not a deep subset. Prefer minimal real seams over polished partials.

---

## 2. Environment realities (design constraints)

Every design choice must respect these three properties:

### 2.1 Stable UIs, but real runtime errors
Enterprise back-office UIs change slowly → **record-once / replay-many is viable**.  
The hard problem is **not** constant layout drift. It is accommodating legitimate runtime conditions:
- validation errors
- “record not found”
- permission denials
- unexpected confirmation dialogs
- session/timeout expiry
- transient slowness
- outright application errors

**Rule:** A happy-path-only capability is **not production-useful**. Replay must detect and respond deliberately.

### 2.2 Heterogeneous, often legacy surfaces
A target may be:
- modern web app
- legacy web app (server-rendered, framesets, deeply nested tables, non-semantic markup, **no test IDs**)
- native desktop application

**Rules:**
- Do **not** assume a clean DOM, stable CSS selectors, or an API.
- Bias perception/action toward approaches that still work when there is **no clean DOM**.
- Primary perception in this repo: **accessibility tree**; screenshots for evidence/multimodal; DOM as secondary fallback — never the only strategy.

### 2.3 Multi-tenant at scale (design for, don’t over-build)
- Hundreds of tenants (institutions), each ~20 apps → thousands of app instances.
- Many tenants run the **same vendor product** configured/branded/versioned differently.
- Automation should **generalize or degrade gracefully** across tenants, not be rebuilt from scratch each time.

**Rule:** Implement against **one** concrete surface; keep abstractions multi-tenant-ready. Do **not** implement tenant plumbing/queues/clusters unless explicitly expanding scope in `REPORT.md`.

---

## 3. Locked technology decisions

| Concern | Decision |
|---|---|
| Language | TypeScript on Node 20+ |
| Schemas | Zod (strict runtime validation); export JSON Schema for external agents when useful |
| Computer-use engine | Playwright |
| Primary UI signal | Accessibility snapshots (`accessibility.snapshot` / ARIA tree) |
| LLM | Gemini 2.5 Flash (default discovery); Pro optional for hard goals |
| Architecture | Single-process modular library + CLI; clean package seams |
| Proxy target | Local `apps/demo-core` intentionally imperfect bank-like UI |
| Operator UX | Minimal mock operator surface; **real** session control transfer |
| Desktop support | Interface + design only in v1 |
| Secrets | Environment variables only; never committed |

If you change any locked decision, update `REPORT.md` Sections 1 and 7 and this table in the same PR.

---

## 4. Core requirements — engineering invariants

These map to brief §3. Agents must not merge code that regresses them.

### 4.1 Goal-driven agent loop (§3.1)
- Accept **goal + target** (app/URL/entry point).
- Run LLM-driven **observe → decide → act** against a **live** surface until goal met or stop condition (`maxSteps`, timeout, dead-end, policy block, stuck).
- Must **actually** interact: click, type, navigate, read state.
- Discovery must be **real** at least once with evidence under `/evidence/`. Descriptions of discovery are insufficient for submission quality.

### 4.2 Structured artifact / capability (§3.2)
After a successful discovery run, emit a typed, serializable artifact that is an **agent-invocable capability**, not a step dump.

**Minimum expressiveness:**
- ordered steps/actions
- how each target control is identified (with robustness reasoning encoded as multi-strategy locators)
- typed **input parameters**
- typed **outputs** / extraction shape
- checkpoint / success condition
- versioning + human/agent-readable description/contract

**Hard rule:** Decouple the capability from the **raw model transcript**. Transcripts may live in evidence; they are not the production artifact.

### 4.3 Deterministic replay (§3.3)
- Given artifact + params → replay **without LLM decisions**.
- Use stable element/control targeting.
- Verify checkpoint/success.
- Return declared outputs.
- Handle errors/exceptional states explicitly (see §5).
- Structured result must distinguish:
  - **expected business outcomes** (e.g., no such member)
  - **recoverable conditions** (dismiss known interstitial, wait/retry transient load)
  - **hard failures** (stop with debuggable error: step, expected, observed)

### 4.4 Safety & policy guardrails (§3.4)
- Enforce explicit configurable **allowlist** (domains/routes + allowed action types). Agent must not act outside it.
- Distinguish **safe/reversible** vs **risky/irreversible**; handle risky conservatively.
- **Never** persist secrets or raw sensitive data (credentials, tokens, full PII) into artifacts or logs. Redact.

### 4.5 Evidence / observability (§3.5)
Produce enough evidence to debug a run:
- structured log of what happened and why (discovery rationales included)
- on failure, at least one richer signal: screenshot and/or a11y snapshot and/or Playwright trace

### 4.6 Human-in-the-loop escalation (§3.6)
When stuck (discovery), unrecoverable (replay), or risky action needs a person:
- Detect and route an **InterventionRequest** with context (capability/goal, step, state/screenshot, reason).
- Let a human take control of the **same live session** (not a fresh one).
- Hand control back; preserve context/evidence; record what the human did.
- Automation must **pause → cede → resume** on the same session; track **who is in control**.

**Scope rule:** Full real-time co-browsing console is out of scope. Minimal real handoff + mock operator UI is required. **Do not** replace real control transfer with a TODO or a fake “new browser” workaround.

### 4.7 Heterogeneity & scale design (§3.7)
Write and keep designs for:
- surface abstraction seam (perceive/act adapter vs recorded flow)
- multi-tenant reuse / specialization / drift management

Do not paint the artifact schema or replay engine into a web-DOM-only corner.

---

## 5. Error & outcome taxonomy (load-bearing)

Conflating business outcomes with failures is the **most common design mistake**. Forbidden.

### 5.1 Expected business outcomes
Legitimate answers the **caller needs**:
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `PERMISSION_DENIED`
- domain-specific codes declared on the artifact

Return them as first-class structured results. Do not throw them as generic crashes.

### 5.2 Recoverable conditions
- Known interstitial/banner with recorded dismiss action
- Transient loading / slow response within caps
- Benign unexpected focus loss recoverable by deterministic wait

Apply **bounded** recoveries; log each recovery; never infinite retry.

### 5.3 Hard failures
- Unresolved locator after all strategies
- Unknown dialog/modal
- Navigation outside allowlist or outside expected flow without detector
- Timeout budget exhausted
- App crash / blank fatal state
- Policy violation

Stop, capture evidence, return debuggable structured error; escalate HITL when configured.

---

## 6. Security, privacy, and compliance posture

This system stands in for **regulated financial data** handling. Treat demo data as if it were sensitive when designing redaction — but only use **synthetic** data in practice.

### 6.1 Allowlist enforcement
- Every navigation and action passes policy checks in **both** discovery and replay.
- Capabilities cannot self-expand allowlists.
- Default deny for unknown action types and unknown origins.

### 6.2 Action risk classes
| Class | Examples | Default handling |
|---|---|---|
| Safe / reversible | navigate within allowlist, open search, type query, extract text | Allowed if allowlisted |
| Risky / irreversible | submit transfer, delete record, close account, confirm payment, finalize enrollment | **Fail closed** or **HITL required** unless capability is explicitly approved for unattended replay *and* policy permits |

Do not “optimistically click through” irreversible confirms in unattended mode.

### 6.3 Secrets & sensitive data
**Never commit or persist:**
- API keys, model keys, passwords, session tokens, cookies
- Full PAN/SSN/account numbers, government IDs, raw auth headers

**Rules:**
- `.env` gitignored; `.env.example` contains names only
- Artifacts store **parameter bindings** (`{ "$input": "memberId" }`), not discovered secrets
- Log redaction middleware mandatory for known sensitive keys
- Evidence screenshots must use synthetic demo data only; mask password fields when feasible
- Public proxy sites: respect terms/rate limits; never real credentials/PII (brief ground rules)

### 6.4 Model data sharing boundary
- Do not send production secrets to the LLM.
- Prefer a11y digests over full HTML to reduce accidental secret leakage.
- Strip known sensitive fields from observations before model calls.

### 6.5 Supply chain & automation ethics
- Prefer local sandbox / demo-core for anything sensitive.
- Do not scrape or stress third-party sites.
- Do not attempt to obtain real banking system access.

---

## 7. Scalability & multi-tenant rules (design-level)

### 7.1 What “scalable” means in this repo
**Credible abstractions**, not deployed scale infrastructure.

Valuable:
- artifact contracts that support reuse across tenants
- surface adapters
- overlay/override model
- drift detection strategy described in `REPORT.md`

Not valuable (do not build now):
- Kubernetes, worker fleets, global job queues
- full multi-tenant control plane
- premature microservices split

### 7.2 Representation rules for reuse
Artifacts SHOULD include (even in single-tenant demos):
- `appFamily` — vendor product family id
- `capabilityVersion` + `schemaVersion`
- `baseCapabilityId` optional pointer
- `tenantOverrides` / overlay hooks (may be empty)
- parameterized paths and inputs (`/members/:id`, not `/members/12345` as the only form)

### 7.3 Drift management (design obligations)
Document and keep extension points for:
- per-tenant locator overlays
- version pins of vendor app
- canary deterministic replays
- confidence/approval gating (stretch)

When replay fails due to tenant drift, prefer: structured failure → HITL or bounded re-discovery — not silent LLM wandering.

---

## 8. Architecture boundaries & module rules

### 8.1 Required seams
1. **SurfaceDriver** — perceive/act/wait/checkpoint/evidence/HITL pause-resume  
2. **PolicyEngine** — allowlist + risk + redaction  
3. **DiscoveryAgent** — LLM loop; emits evidence + draft artifact  
4. **Artifact** — Zod schemas; load/save/validate/migrate  
5. **ReplayEngine** — deterministic executor; no LLM calls in default path  
6. **OutcomeDetectors / Recoveries** — declarative exceptional-state handling  
7. **HITL Controller** — ownership state machine + intervention records  
8. **EvidenceSink** — jsonl + screenshots + a11y + result  

### 8.2 Dependency direction
```
CLI → DiscoveryAgent / ReplayEngine / HITL
DiscoveryAgent → LLM, Policy, Surface, ArtifactCompiler, Evidence
ReplayEngine → Policy, Surface, Artifact, Detectors, Evidence
HITL → Surface session ownership, Evidence
Surface (Playwright) → Policy pre-act hooks
```
Forbidden: ReplayEngine importing LLM client in the default path.  
Forbidden: Artifact schema importing Playwright types.

### 8.3 Process model
Default: **single process**.  
If adding HTTP later, keep domain logic in libraries; HTTP is a thin adapter (stretch).

### 8.4 Sync vs queued
Default: **synchronous CLI runs** with explicit timeouts.  
Queues are a future adapter at the CLI/API boundary — do not entangle domain types with queue payloads prematurely.

---

## 9. Locator & determinism standards

### 9.1 Locator priority (record and resolve in this order)
1. Accessibility role + accessible name (+ relevant states)
2. Label / surrounding semantic context (e.g., row keyed by member id)
3. Stable non-random attributes when truly stable
4. Relative a11y structural path
5. Last-resort geometric/visual hints (mark low confidence; avoid as sole production locator)

**Avoid as primary:** absolute XPath, full CSS chains, autogenerated ids, test-id-only strategies.

### 9.2 Waiting
- Explicit, capped waits tied to a11y/URL/network conditions
- No unbounded `sleep`
- Deterministic polling intervals

### 9.3 Checkpoints
Every capability must declare a **success checkpoint**. Prefer asserting observable state (heading text, URL pattern, balance field present) over assuming a click worked.

### 9.4 Compilation hygiene
Discovery may explore; artifacts must keep the **successful parameterized path** plus known recoveries — not the entire exploratory mess.

---

## 10. LLM / computer-use rules

### 10.1 When the model may decide
- **Discovery mode only** (and optional stretch: single-step bounded assisted fallback on replay failure, policy-checked, recorded as evidence).

### 10.2 Structured outputs required
- Tool/function calls validated by Zod
- Reject/repair invalid model actions; never execute unvalidated payloads

### 10.3 Context discipline
- Provide goal, policy summary, compact observation, recent actions
- Avoid dumping raw DOM by default
- Attach screenshots when target resolution fails or state is ambiguous

### 10.4 Stop conditions
Implement max steps, wall timeout, no-progress detection, policy denials, explicit `declare_stuck`.

### 10.5 Evidence of reality
At least one genuine live-model discovery run must exist under `/evidence/` for submission. Do not fabricate evidence.

---

## 11. HITL control-transfer model

### 11.1 Ownership states
`automation` → `transferring` → `human` → `transferring` → `automation` (or terminal abort)

### 11.2 InterventionRequest must include
- run id, session id
- reason (`stuck_discovery` | `unrecoverable_replay` | `risky_action` | `policy`)
- capability/goal, step id
- observation summary + screenshot/evidence refs
- why it stopped
- timestamps

### 11.3 Session identity
Human operates the **same** Playwright browser context/page (headed). Starting a new browser for “manual” steps is a **spec violation**.

### 11.4 Resume
On resume, re-observe, verify still on a coherent state, then continue automation or finalize. Record human actions best-effort and always record handoff boundaries.

### 11.5 Operator UI
May be mocked/minimal. Control-transfer machinery must be real and testable.

---

## 12. Observability & evidence standards

### 12.1 Evidence directory convention
```
evidence/<runId>/
  meta.json
  events.jsonl
  result.json
  screenshots/
  a11y/
  trace.zip            # optional but encouraged
```

### 12.2 Event requirements
Each act/decide/replay step should be reconstructable: timestamps, step id, action, target ref, policy decision, outcome class, short rationale (discovery).

### 12.3 Failure richness
On hard failure or stuck: screenshot + a11y digest minimum.

### 12.4 Redaction before write
EvidenceSink applies redaction — no bypass path for “just this once” debug dumps of secrets into the repo.

---

## 13. Target application rules

### 13.1 Proxy target
Use `apps/demo-core` (local). It must support multi-step flows and injectable exceptional states.

### 13.2 Forbidden targets
- Real bank/CU systems
- Sites requiring personal real credentials
- Anything that violates terms or harms a service

### 13.3 Data
Synthetic members, balances, and credentials only.

---

## 14. Deliverables & path conventions (exact)

Submissions are compared side-by-side; keep these paths/headings exact.

### 14.1 README.md must cover
- setup & run instructions
- keys/config required
- how to run **without** live LLM/services when applicable
- demo path: exact commands for discover then replay

### 14.2 REPORT.md must use these seven headings only as top-level sections
1. Architecture  
2. Artifact schema  
3. Determinism & error handling  
4. Heterogeneity & multi-tenant  
5. Escalation & handoff  
6. Safety  
7. Cuts  

### 14.3 /evidence/
- example saved artifact
- discovery run logs
- replay run logs
- ideally one exceptional-state replay
- optional screen recording

### 14.4 Public GitHub
Final human submission: public repo URL emailed to `assignments@interface.ai` (URL on its own line; no zip). Agents may prepare the repo but must not email on behalf of the candidate unless asked.

---

## 15. Quality bar & evaluation priorities

Build and review against this weight order:

1. **System design** — boundaries, data models, trade-offs, simplicity; artifact schema & replay contract are central  
2. **Correctness of core loop** — real goal completion; deterministic replay verifies success  
3. **Robustness & error handling** — taxonomy, locators, waits, checkpoints  
4. **HITL escalation** — real mechanism, not TODO  
5. **Generalization** — heterogeneous surfaces + cross-tenant reuse story  
6. **Safety & data handling**  
7. **Code quality** — readable, typed, tested where it counts, easy to run  
8. **Communication** — reasoning, trade-offs, cut lines clear in REPORT  

**Not rewarded:** feature breadth, framework name-dropping, premature scale infrastructure.

---

## 16. Coding standards for agents

### 16.1 TypeScript
- `strict` true
- No `any` without a narrow, justified escape hatch
- Prefer explicit domain types over leaking Playwright types across boundaries

### 16.2 Validation
- All artifact I/O through Zod
- All LLM tool args through Zod
- All CLI inputs validated before execution

### 16.3 Testing where it counts
Required coverage focus:
- policy allow/deny
- redaction
- locator resolution order
- outcome taxonomy classification
- artifact schema accept/reject
- HITL ownership transitions
- at least one LLM-free replay integration against demo-core

Do not chase coverage % vanity.

### 16.4 Changes should be vertical-slice preserving
If you change schema, update compiler, replay, fixtures, evidence examples, and REPORT in the same change set when behavior changes.

### 16.5 Documentation hygiene
- Prefer updating `REPORT.md` / `README.md` over adding random new markdown files
- Do not create extra docs unless asked or needed for seams

### 16.6 Git hygiene
- Never commit secrets
- Never rewrite shared history unless explicitly requested
- Commit only when the user asks

---

## 17. Depth vs breadth policy (Section 5)

### 17.1 Go deep on
- artifact schema
- deterministic replay + error handling
- safety / escalation model

### 17.2 Cut depth, not whole capabilities
Every §3 requirement must exist in thin-but-real form.

### 17.3 Intentional mocks allowed
- operator UI
- desktop surface adapter

Must be intentional, documented, with a **real seam**.

### 17.4 Say what you cut
Update REPORT §7 with cuts and next steps. Stopping early is acceptable; silent incompleteness is not.

---

## 18. Stretch goals policy

Only after the core vertical slice is solid. Pick **at most one or two**:

- Agent-facing capability catalog/API invoke-by-name
- Code generation from artifact
- Confidence & approval (`draft → approved`)
- Bounded assisted LLM fallback on replay (single step, policy-checked)
- Canonicalization / cross-tenant overlay demo
- Multi-run stability scoring

**Default preference if time:** capability catalog **or** cross-tenant overlay demo.

---

## 19. Operational runbooks for agents

### 19.1 Adding a new action type
1. Add to Zod action schema  
2. Add policy allowlist entry defaults  
3. Implement on SurfaceDriver  
4. Map LLM tool (discovery)  
5. Support in replay  
6. Tests + redaction considerations  
7. Document risk class  

### 19.2 Adding a known business outcome
1. Add outcome code to taxonomy  
2. Add detector (a11y/URL/text)  
3. Attach to artifact or appFamily defaults  
4. Ensure replay returns `business_outcome`  
5. Add demo-core way to trigger + evidence example  

### 19.3 Changing artifact schema
1. Bump `schemaVersion`  
2. Add migration or compatibility notes  
3. Update compiler + replay + fixtures  
4. Regenerate example under `capabilities/` and `/evidence/`  
5. Explain in REPORT §2  

### 19.4 Discovery run checklist
1. demo-core running  
2. allowlist includes target  
3. `GEMINI_API_KEY` present  
4. headed/headless choice documented  
5. evidence bundle written  
6. artifact validates under Zod  
7. immediate replay smoke on same artifact  

### 19.5 Replay failure triage order
1. Classify: business vs recoverable vs hard  
2. Inspect step id + expected vs observed  
3. Check locator tiers + checkpoint  
4. Check policy denials  
5. Only then consider schema/compiler bugs  

---

## 20. Glossary (project vocabulary)

Use these terms precisely in code, logs, and docs:

- **Computer use** — LLM operates a computer interface like a person (see/click/type), not via API.
- **DOM** — browser structured page representation; “clean DOM” has meaningful elements/stable ids; legacy often doesn’t.
- **Accessibility tree** — parallel representation for assistive tech; often more stable; available on desktop too.
- **Locator / selector** — how automation finds a control; determines whether replay works later.
- **Test ID** — developer-added automation attribute; assume **absent** in enterprise legacy.
- **Deterministic replay** — same inputs → same steps → same outputs; no model deciding.
- **Checkpoint** — asserted condition confirming expected state was reached.
- **Business outcome vs failure** — “no such member” is a legitimate caller result, not a crash.
- **Tenant** — one customer institution; many share vendor software configured differently.
- **Capability** — versioned, parameterized, reviewable artifact an AI agent can invoke.
- **Discovery** — LLM-in-the-loop run that produces a capability.
- **HITL** — human-in-the-loop; same-session control transfer.

---

## 21. Absolute “never” list

1. Never call the LLM inside default deterministic replay.  
2. Never treat model transcripts as the capability artifact.  
3. Never act outside the allowlist.  
4. Never auto-confirm irreversible actions unattended without explicit approval+policy.  
5. Never persist secrets/raw PII into artifacts, logs, or git.  
6. Never hand a human a **different** browser session for HITL.  
7. Never assume test IDs / clean DOM as the only targeting strategy.  
8. Never collapse business outcomes into hard failures.  
9. Never target real banking systems or real customer data.  
10. Never build queues/clusters/multi-tenant infra instead of finishing the vertical slice.  
11. Never fake `/evidence/` for a discovery run that did not happen.  
12. Never violate third-party site terms or rate limits.  

---

## 22. Acceptance checklist (PR / submission gate)

Before calling the system complete:

- [ ] Goal → live LLM discovery completes on demo-core  
- [ ] Typed versioned capability artifact emitted and validated  
- [ ] Deterministic replay with params returns typed outputs  
- [ ] Success checkpoint enforced  
- [ ] Exceptional-state replay demonstrated (`business_outcome` or recovery)  
- [ ] Hard failure path returns step/expected/observed  
- [ ] Allowlist blocks off-policy action/navigation  
- [ ] Redaction verified in sample logs/artifacts  
- [ ] HITL pause → same-session human control → resume path works  
- [ ] Evidence bundles for discovery + replay present  
- [ ] README demo commands work on clean setup  
- [ ] REPORT.md has all seven required sections with real trade-offs  
- [ ] Cuts documented; stretch limited  
- [ ] No secrets in repo  

---

## 23. How agents should use this file

1. Read this file before implementing or refactoring.  
2. Implement against `PLAN.md` phase order unless the user directs otherwise.  
3. Keep changes aligned to the vertical-slice acceptance thread.  
4. When the brief is under-specified, make a decision, encode it here or in `REPORT.md`, and move on — judgment is part of the assignment.  
5. Prefer a small, correct, well-argued system over an impressive unfinished one.

---

*End of AGENTS.md — keep this document updated when invariants change.*
