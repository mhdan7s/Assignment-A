# Phase 0 → Phase 1 Implementation Plan

**Scope:** Problem framing lock-in (Phase 0) + repository scaffolding & boundaries (Phase 1) only.  
**Out of scope for this plan:** Surface driver, policy engine, agent loop, replay, HITL, demo-core UI logic (those start Phase 2 / 11).  
**Sources:** `PLAN.md` Phases 0–1, `AGENTS.md` invariants.

---

## Goal of this slice

Leave the repo in a state where:

1. Git is initialized with a safe `.gitignore` (done).
2. Phase 0 decisions are explicit and checkable.
3. Phase 1 produces a **runnable TypeScript project skeleton**: install works, strict TS, env secrets pattern, module seams as empty-but-real packages/folders, CLI stubs for `discover` / `replay` / `hitl-mock`, and placeholder deliverable files at the **exact** submission paths.

This is scaffolding with correct boundaries — not feature logic yet.

---

## Phase 0 — Framing lock-in (before writing much code)

Phase 0 is mostly confirmation. Do these as checklist items in the scaffold PR/commit message or a short `docs` note inside README stubs — do **not** invent new product scope.

### 0.1 Confirm locked decisions (already in PLAN/AGENTS)

| Item | Locked value | Scaffold implication |
|---|---|---|
| Language | TypeScript Node 20+ | `engines.node`, `tsconfig` target ES2022 |
| Schemas | Zod | dependency + `src/artifact` placeholder |
| Computer-use | Playwright | dependency declared; browser install documented later |
| LLM | Gemini 2.5 Flash | `@google/generative-ai` dep; `GEMINI_API_KEY` in `.env.example` |
| Architecture | Single-process modular lib + CLI | `src/*` modules + `src/cli` |
| Proxy target | `apps/demo-core` | folder + minimal placeholder server only |
| Operator UI | mock later | `hitl-mock` CLI stub only in Phase 1 |
| Desktop / multi-tenant infra | design only | no packages for K8s/queues |

### 0.2 Confirm vertical-slice acceptance thread

Keep visible in `README.md` (short) and already present in `AGENTS.md` §22. Phase 1 does **not** implement the thread — only ensures the repo structure anticipates it.

### 0.3 Explicit cut list (encode in README “Status” + later REPORT §7)

For Phase 1, document as **intentional stubs**:

| Capability | Phase 1 state |
|---|---|
| Discovery agent | CLI stub → prints “not implemented” / exits 0 or 1 clearly |
| Replay engine | CLI stub |
| HITL | CLI stub |
| SurfaceDriver | folder + `types.ts` interface stub only (optional thin types; full impl Phase 2) |
| Policy / redaction | folder stub |
| demo-core flows | placeholder `index.html` or “coming in Phase 11” server hello |
| REPORT.md | skeleton with **exact seven headings**, body TBD |
| `/evidence/` | `.gitkeep` (+ short README in folder explaining purpose) |
| `/capabilities/` | `.gitkeep` |

### Phase 0 exit criteria mapping

- [x] Locked decisions agreed (in PLAN/AGENTS)
- [x] Vertical-slice checklist in AGENTS
- [ ] Cut list written into README Status (do in Phase 1 scaffold)

---

## Phase 1 — Thorough implementation breakdown

### 1.A Toolchain & root package

**Create:**
- `package.json`
  - `name`: e.g. `computer-use-automation` (or `cua-system`)
  - `"type": "module"` (ESM)
  - `engines`: `node >= 20`
  - scripts:
    - `build` → `tsc -p tsconfig.json`
    - `dev` / `start` → run CLI via `tsx`
    - `discover` → `tsx src/cli/index.ts discover`
    - `replay` → `tsx src/cli/index.ts replay`
    - `hitl:mock` → `tsx src/cli/index.ts hitl-mock`
    - `demo:core` → placeholder for demo app start
    - `test` → placeholder (`vitest` or `node --test`) — can be no-op/minimal until later
    - `typecheck` → `tsc --noEmit`
  - dependencies (declare now, use later):
    - `zod`
    - `zod-to-json-schema` (optional now)
    - `playwright`
    - `@google/generative-ai`
    - `dotenv`
    - `pino` (+ `pino-pretty` as devDep for local)
    - `commander` or `cac`
    - `express` (demo-core + future operator mock)
  - devDependencies:
    - `typescript`
    - `tsx`
    - `@types/node`
    - `@types/express`
    - `vitest` (optional in Phase 1)

**Create:**
- `tsconfig.json`
  - `strict: true`
  - `noUncheckedIndexedAccess: true` (recommended)
  - `module` / `moduleResolution`: NodeNext
  - `outDir`: `dist`
  - `rootDir`: `.` or `src` — prefer project references style: compile `src` → `dist`, keep `apps/demo-core` separate simple JS/TS
  - include: `src/**/*`
  - exclude: `node_modules`, `dist`, `apps/**` (demo-core can be plain ESM JS initially) **or** include demo-core with its own tsconfig later

**Recommendation for Phase 1 simplicity:**
- Main system: `src/` compiled with root `tsconfig.json`
- `apps/demo-core`: separate minimal Express static app with its own tiny `package.json` **or** script from root — prefer **root-owned** `apps/demo-core` without nested package first to avoid monorepo tooling complexity

### 1.B Directory tree to create

```
/
  .gitignore                 # done
  .env.example
  package.json
  tsconfig.json
  README.md                  # setup stubs + demo commands placeholders
  REPORT.md                  # seven headings skeleton
  AGENTS.md                  # exists
  PLAN.md                    # exists
  Assignment A - ….pdf       # keep tracked (brief)
  src/
    cli/
      index.ts               # commander entry
      commands/
        discover.ts          # stub
        replay.ts            # stub
        hitlMock.ts          # stub
    surface/
      index.ts
      types.ts               # SurfaceDriver interface sketch (align PLAN Phase 2)
    policy/
      index.ts               # export placeholder PolicyEngine type
    agent/
      index.ts
    artifact/
      index.ts
      schema.ts              # zod z.object({ schemaVersion: z.string() }) minimal stub
    replay/
      index.ts
    errors/
      index.ts               # outcome union type stub
    hitl/
      index.ts               # ControlOwner enum stub
    evidence/
      index.ts
    llm/
      index.ts
    shared/
      env.ts                 # load dotenv + typed config
      logger.ts              # pino with redaction paths preconfigured
  apps/
    demo-core/
      README.md              # “hostile bank proxy — implemented Phase 11”
      public/index.html      # “Demo Core placeholder”
      server.ts              # express static on 4173
  capabilities/
    .gitkeep
  evidence/
    .gitkeep
    README.md                # what belongs here for submission
  tests/
    smoke.test.ts            # optional: assert CLI --help exits 0
```

### 1.C Secrets & env

**`.env.example`**
```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DEMO_CORE_ORIGIN=http://127.0.0.1:4173
LOG_LEVEL=info
# Never put real bank credentials here.
```

**`src/shared/env.ts`**
- load dotenv
- export typed `env` object
- do not throw on missing `GEMINI_API_KEY` at import time for replay/help — only discover command validates key when invoked

**Verify:** `.env` is gitignored (already).

### 1.D Logger stub (security seam early)

**`src/shared/logger.ts`**
- pino instance with `redact.paths` for: `password`, `token`, `authorization`, `cookie`, `ssn`, `pan`, `*.password`, `*.token`
- even before real logging exists, establishing redaction default satisfies AGENTS §6 direction

### 1.E CLI stubs (Phase 1 exit criterion)

Using `commander`:

```text
cua discover --goal <string> --target <url> [--out <path>]
cua replay --artifact <path> --input <json>
cua hitl-mock --run <runId>
```

npm scripts map to these.

**Stub behavior:**
- Parse args
- Print structured message: module not implemented; point to PLAN phase
- Exit code `0` for `--help`; exit `2` for “not implemented” (or `0` with clear WARN — prefer **exit 2** so CI can distinguish later)

### 1.F Module boundary stubs (empty-but-real)

Each `src/<module>/index.ts` should:
- export a named facade (`export function notImplemented(name: string): never`)
- include a one-line JSDoc referencing AGENTS section / PLAN phase
- **not** contain Playwright launches or Gemini calls yet

Optional but valuable in Phase 1: put the **SurfaceDriver interface** and **ReplayResult** / **ControlOwner** type sketches in `types.ts` files so Phase 2+ fills implementations without reshaping folders.

### 1.G Deliverable path placeholders

**`README.md` (minimal but honest)**
- Project one-liner (through-line)
- Prerequisites (Node 20+, Git)
- Setup: `npm install`, copy `.env.example` → `.env`
- Scripts table
- Demo path section with commands (note: discover/replay stub until later phases)
- “Running without live services” — typecheck / stub CLI help
- Status / cuts (Phase 0.3)
- Link to AGENTS.md / PLAN.md

**`REPORT.md`**
```markdown
# Design Report

## 1. Architecture
_TBD in later phases._

## 2. Artifact schema
...

(all seven headings present)
```

**`evidence/README.md`**
- Explain required contents per brief §6.3
- Note runtime traces may be large; submission evidence is intentional and tracked

### 1.H demo-core placeholder (boundary only)

Not the full hostile bank UI yet (Phase 11), but Phase 1 layout requires the folder:

- Express static server on `127.0.0.1:4173`
- Single placeholder page: “demo-core placeholder — full flows in Phase 11”
- `npm run demo:core` starts it
- Proves port/origin convention used later in allowlists

### 1.I Install & verify sequence (definition of done for Phase 1)

Run in order after files exist:

1. `npm install`
2. `npm run typecheck` — clean
3. `npm run build` — emits `dist/` (gitignored)
4. `npm run discover -- --help` — shows help
5. `npm run replay -- --help`
6. `npm run hitl:mock -- --help`
7. `npm run demo:core` — serves placeholder (manual smoke)
8. Confirm `git status` does **not** want `.env`, `node_modules`, `dist`
9. Confirm tracked essentials: source stubs, md files, pdf, gitignore, env example

### Phase 1 exit criteria (from PLAN) — mapped to tasks

| Criterion | Implementation task |
|---|---|
| `npm install` works | 1.A + install |
| CLI stubs discover/replay/hitl-mock | 1.E |
| Secrets via env; `.env` gitignored | 1.C + existing gitignore |
| TypeScript strict mode on | 1.A `tsconfig` |

---

## Suggested file-creation order (execute this sequence)

1. `package.json` + `tsconfig.json`
2. `.env.example`
3. `src/shared/env.ts` + `logger.ts`
4. `src/cli/**` stubs
5. Empty module facades under `src/*`
6. `apps/demo-core` placeholder server
7. `capabilities/.gitkeep`, `evidence/.gitkeep` + evidence README
8. `README.md`, `REPORT.md` skeleton
9. `npm install` + verify commands
10. (Optional, only if you ask) initial git commit of scaffold

---

## Explicit non-goals for Phase 0–1

- No Gemini API calls
- No Playwright browser launch
- No real artifact schema beyond a tiny zod stub
- No policy enforcement logic
- No HITL session transfer
- No hostile multi-page bank UI
- No `/evidence` fake discovery logs
- No premature monorepo tooling (pnpm workspaces, Nx, Turborepo)

---

## Risk & judgment notes

- **Nested packages:** skip in Phase 1; one root `package.json` keeps install trivial for reviewers.
- **Interface stubs vs empty folders:** prefer thin TypeScript interfaces now — they document seams without implementing Phase 2.
- **Exit codes on stubs:** use distinct “not implemented” so later we don’t confuse with successful empty runs.
- **PDF:** keep tracked; it’s the brief and is small (~200KB).
- **Commit:** git is initialized; create the first commit only when you ask.

---

## Ready-to-implement checklist

- [x] `git init` on `main`
- [x] `.gitignore` covering node/build/env/IDE/OS/playwright/local scratch
- [x] Implement Phase 1 file tree & package as specified above
- [x] Verify install/typecheck/CLI help/demo placeholder
- [x] Mark Phase 0 cut list into README Status
- [ ] User-requested initial commit when ready

---

## Next after Phase 1

Phase 11 (demo-core real UI) and Phase 2 (SurfaceDriver) per `PLAN.md` execution order — demo target early, then surface + policy.
