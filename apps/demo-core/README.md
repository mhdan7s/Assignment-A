# demo-core

Local intentionally imperfect core-banking proxy for computer-use discovery/replay.

## Run

```bash
npm run demo:core
```

Open `http://127.0.0.1:4173`

## Synthetic credentials

| Field | Value |
|---|---|
| Username | `teller` |
| Password | `demo-pass` |

## Sample members

| Member ID | Behavior |
|---|---|
| `12345` | Happy path — savings/checking visible; sub-account wizard works |
| `67890` | Permission denied on detail |
| anything else | Record not found |

## Flows covered

1. Staff login  
2. Member search by ID  
3. Member detail (table layout + **iframe** balance pane)  
4. Open sub-account → **confirmation screen**  
5. Injection panel at `/inject`:
   - system notice interstitial  
   - session expiry on next request  
   - forced permission denied  
   - slow search/detail delay  

## Exceptional states (no inject panel needed)

- Empty member ID → validation error  
- Unknown ID → not found  
- Member `67890` → permission denied  

## Hostility notes

- Table-based layout, iframe detail pane, random chrome element ids  
- **No test IDs**  
- Meaningful labels / `aria-label`s so an a11y-first agent still has a signal  

Synthetic data only — never real credentials or PII.
