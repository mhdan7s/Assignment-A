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

- Node.js **20+**
- Git
- (Later) Gemini API key for live discovery; Playwright browsers for computer-use

## Setup

```bash
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

Fill `GEMINI_API_KEY` only when you run live discovery (not required for stubs / demo-core).

Playwright browsers (needed from Phase 2+):

```bash
npx playwright install chromium
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Emit `dist/` |
| `npm run demo:core` | Local hostile bank proxy on `:4173` |
| `npm run discover` | Discovery CLI (stub → exit 2 until Phase 4) |
| `npm run replay` | Replay CLI (stub → exit 2 until Phase 6) |
| `npm run hitl:mock` | HITL mock CLI (stub → exit 2 until Phase 9) |
| `npm test` | Smoke + locator + surface↔demo-core tests |


## Demo-core (Phase 11)

```bash
npm run demo:core
```

- URL: `http://127.0.0.1:4173`
- Login: `teller` / `demo-pass`
- Member `12345` → savings balance + sub-account confirmation flow
- Member `67890` → permission denied
- Unknown / empty ID → not found / validation
- `/inject` → interstitial, session expiry, forced deny, slow delay

See [`apps/demo-core/README.md`](./apps/demo-core/README.md).

## Demo path (automation still stubbed)

> **Windows / PowerShell note:** prefer `npm.cmd` or `npx tsx`. Use `--flag=value` form.

```bash
npm run demo:core

npx tsx src/cli/index.ts discover --goal="Look up member 12345 and read savings balance" --target=http://127.0.0.1:4173
```

## Running without live services

```bash
npm run typecheck
npm run demo:core
npx tsx src/cli/index.ts --help
npm test
```

## Status / cuts

| Area | State |
|---|---|
| Repo layout + strict TS + env/logger redaction | **Done** |
| `apps/demo-core` multi-step + injectable errors | **Done** |
| `PlaywrightWebDriver` + multi-strategy locators | **Done** (Phase 2) |
| CLI `discover` / `replay` / `hitl-mock` | **Stub** |
| Policy allowlist / risk classes | **Not started** (Phase 3) |
| Discovery agent / replay / HITL operator | **Stubs** |
| `REPORT.md` | Partial (§4 surface seam filled) |
| Real LLM discovery + deterministic replay | **Not started** |

## Locked stack

TypeScript + Zod · Playwright (a11y-first) · Gemini 2.5 Flash · local `demo-core` · single-process modular CLI
