# Computer-Use Automation System

Backend integration layer that gives AI agents hands for legacy (no-API) back-office UIs: **the model discovers → a typed capability artifact is saved → deterministic replay is the production path.**

Guiding docs: [`AGENTS.md`](./AGENTS.md) · [`REPORT.md`](./REPORT.md) · [`apps/demo-core/README.md`](./apps/demo-core/README.md)

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

- Node.js **20+** (TypeScript/Node only — no Python `venv` required)
- Git
- Gemini API key for **live discovery** only
- Playwright Chromium for surface/replay/discovery

> Local Python envs (if any) belong in `.venv/` (gitignored).

## Setup

```bash
npm install
copy .env.example .env   # Windows
npx playwright install chromium
```

Set `GEMINI_API_KEY` for discovery. `DEMO_CORE_PASSWORD=demo-pass` is the synthetic teller password used by replay `$env` bindings.

## Scripts

| Script | Purpose |
|---|---|
| `npm run demo:core` | Hostile bank proxy on `:4173` |
| `npm run replay` | Deterministic capability replay (no LLM) |
| `npm run discover` | Gemini discovery → artifact + evidence |
| `npm run hitl:mock` | HITL stub (Phase 9) |
| `npm run typecheck` / `build` / `test` / `ci` | Quality gates |

## Demo path

> **Windows:** prefer `npx tsx` or `npm.cmd` with `--flag=value`.

```bash
# terminal 1
npm run demo:core

# terminal 2 — deterministic replay (no Gemini)
npx tsx src/cli/index.ts replay --artifact=capabilities/lookup-savings/1.0.0.json --input={"memberId":"12345"}

# exceptional business outcome
npx tsx src/cli/index.ts replay --artifact=capabilities/lookup-savings/1.0.0.json --input={"memberId":"NOPE"}

# live discovery (requires GEMINI_API_KEY)
npx tsx src/cli/index.ts discover --goal="Look up member 12345 and read savings balance" --target=http://127.0.0.1:4173/login
```

Login for manual browsing: `teller` / `demo-pass`.

## Running without live LLM

```bash
npm run typecheck
npm run demo:core
npm test
npx tsx src/cli/index.ts replay --artifact=capabilities/lookup-savings/1.0.0.json --input={"memberId":"12345"}
```

## CI / CD

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — typecheck, build, test on `main` PRs/pushes. No Gemini secret required for the current suite.

## Status / cuts

| Area | State |
|---|---|
| demo-core + SurfaceDriver + policy | **Done** |
| Artifact schema + golden `lookup-savings` | **Done** |
| Deterministic replay + NOT_FOUND outcome | **Done** |
| Evidence writer | **Done** |
| Gemini discovery loop | **Implemented** (needs API key for live evidence) |
| HITL operator mock | **Stub** |
| Submission `/evidence/` from a real discovery run | **Pending your API key run** |
