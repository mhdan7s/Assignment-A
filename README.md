# Computer-Use Automation System

Backend integration layer that gives AI agents hands for legacy (no-API) back-office UIs: **the model discovers → a typed capability artifact is saved → deterministic replay is the production path.**

Guiding docs: [`AGENTS.md`](./AGENTS.md) · [`PLAN.md`](./PLAN.md) · [`PHASE_0_1_IMPLEMENTATION.md`](./PHASE_0_1_IMPLEMENTATION.md)

## Vertical slice (target)

```
goal + target
  → LLM observe→decide→act discovery run (live UI)
  → typed, versioned capability artifact (no raw model transcript)
  → deterministic replay with params + outputs + checkpoints
  → error/outcome taxonomy (incl. exceptional-state replay)
  → HITL: stuck → intervention → human takes live session → resume
  → evidence under /evidence/
  → allowlist + redaction enforced throughout
```

## Prerequisites

- Node.js **20+**
- Git
- (Later) Gemini API key for live discovery; Playwright browsers for computer-use

## Setup

```bash
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

Fill `GEMINI_API_KEY` only when you run live discovery (not required for Phase 1 stubs).

Playwright browsers (needed from Phase 2+):

```bash
npx playwright install chromium
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Emit `dist/` |
| `npm run discover -- --goal "..." --target URL` | Discovery CLI (stub → exit 2) |
| `npm run replay -- --artifact PATH --input '{}'` | Replay CLI (stub → exit 2) |
| `npm run hitl:mock -- --run RUN_ID` | HITL mock CLI (stub → exit 2) |
| `npm run demo:core` | Local demo-core placeholder on `:4173` |
| `npm test` | Smoke tests |

## Demo path (current = Phase 1 stubs)

> **Windows / PowerShell note:** prefer `npm.cmd` (or call `npx tsx` directly). PowerShell’s `npm` shim can swallow `--flags`. Use `--flag=value` form.

```bash
# terminal 1 — placeholder UI
npm run demo:core

# terminal 2 — help / stubs (exit code 2 = not implemented yet)
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts discover --goal="Look up member 12345 and read savings balance" --target=http://127.0.0.1:4173

npx tsx src/cli/index.ts replay --artifact=capabilities/example.json --input={"memberId":"12345"}

npx tsx src/cli/index.ts hitl-mock --run=example-run-id

# equivalent via npm.cmd on Windows:
npm.cmd run discover -- --goal=test --target=http://127.0.0.1:4173
```

## Running without live services

Phase 1 needs **no** Gemini key and **no** Playwright browsers:

```bash
npm run typecheck
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts discover --help
npm test
```

## Status / cuts (Phase 0–1)

| Area | State |
|---|---|
| Repo layout + strict TS + env/logger redaction defaults | **Done** |
| CLI `discover` / `replay` / `hitl-mock` | **Stub** (parse args, exit `2`) |
| `SurfaceDriver` types | **Seam only** (impl Phase 2) |
| Policy / agent / replay / HITL / evidence writers | **Stubs** |
| `apps/demo-core` | **Placeholder page** (full UI Phase 11) |
| `REPORT.md` | **Seven headings skeleton** |
| `/evidence`, `/capabilities` | **Directories ready** |
| Real LLM discovery + deterministic replay | **Not started** |

## Locked stack

TypeScript + Zod · Playwright (a11y-first) · Gemini 2.5 Flash · local `demo-core` · single-process modular CLI
