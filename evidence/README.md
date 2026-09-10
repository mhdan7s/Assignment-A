# Evidence

Submission evidence for the computer-use automation vertical slice (brief §6.3).

Each run should land under `evidence/<runId>/` with enough material to prove and debug:

- `meta.json` — goal/mode/timestamps/model/artifact id
- `events.jsonl` — structured observe/decide/act or replay steps
- `result.json` — final structured result contract
- `screenshots/` — especially on failure / stuck
- `a11y/` — accessibility snapshots on failure / stuck
- `trace.zip` — optional Playwright trace

Required for submission:

1. A saved example capability artifact (also mirrored under `/capabilities/`)
2. Logs from a **real** LLM discovery run
3. Logs from a deterministic replay run
4. Ideally one replay that hits an error or exceptional business outcome

Do not fabricate discovery evidence. Do not commit secrets or real PII. Local oversized scratch (e.g. `trace-raw/`) is gitignored.
