# P1 — Vertical slice: poll → route → pane

**Goal:** the thinnest *real* end-to-end path. Pane shows `reachable` / `unreachable` / `idle` from live data. No `/slots`, no meat, no wedged — that's later phases. Prove the pipeline first (protocol rule 5).

**Read:** this file + `ENV.md` §"Endpoint matrix" and §"Canonical identifiers". **Not** `PLAN.md`.

**Requires:** P0 committed and activating.

---

## Scope — deliberately small

Three states only:

| State | Evidence |
| --- | --- |
| `unreachable` | `GET {origin}/health` fails (refused/timeout/5xx) |
| `idle` | `/health` → 200 |
| `unknown` | reachable but not a recognizable server shape |

Use **only** `/health`. It is the one endpoint that needs **no API key** (verified: 200 without auth), which means P1 works before P5 exists. Do not touch `/slots` in this phase — auth and the `/v1` trap are P2/P4 concerns and mixing them in now will make failures ambiguous.

## What to build

- `src/host/collect.ts` — one async function: poll `{origin}/health`, measure latency, return a snapshot with `{ ok, state, latencyMs, lastError, sampledAt }`. Use a short timeout (~2s) so an unreachable server doesn't stall the loop. **Must never throw** — catch and return an error snapshot (gpu-monitor's `sampleFleet()` lesson).
- 1s sampling loop in `src/host/index.ts` (Q4). Mirror the blueprint's `SAMPLE_INTERVAL_MS = 1000` pattern. Clean up the timer on unload.
- `src/host/route.ts` — serve the latest snapshot at `/api/dsh-slot-health`. Degrade to error JSON rather than letting `apply` throw.
- `src/client/` — self-chaining `fetch` with `no-store` + abortable (blueprint's `useGpu.ts` is the pattern), render state + latency + "updated N s ago".

Config: read the origin from plugin config with default `http://127.0.0.1:8080`. Keep it a single string for now; P5 adds the key.

## Your call

- Snapshot type shape beyond the fields listed (design it so P2 adds slot fields without a rewrite — but don't pre-build them).
- Whether "updated N s ago" is computed client-side from `sampledAt` or server-side. Client-side is more honest about transport staleness.
- Visual design of the placeholder pane — inline styles only (no CSS pipeline out-of-tree). **Read [`STYLE.md`](../STYLE.md) now** and adopt its `color: inherit` + `color-mix(currentColor)` theming from the first line of UI you write; retrofitting theme-agnostic styling later is annoying.

## Verify

1. Rebuild, boot `:3090`. **Verify the host half with `curl`** — that's yours. The browser half (does the pane render?) is `pending-human`; see P0's static checks and record it in `ACCEPTANCE.md`.
2. Server up → pane reads **idle**, "updated N s ago" **advances** (AC2). If the age freezes, your poll loop is dead and you're rendering a cached snapshot.
3. `curl -s http://127.0.0.1:3090/api/dsh-slot-health` → JSON matching the pane.
4. **AC1:** make it unreachable *without touching a sacred process* — point the configured origin at a dead port (e.g. `http://127.0.0.1:9999`) via config, not by killing `:8080`. Pane must read **unreachable within ≤3 polls**, show last error + age, and the chat UI must stay usable.
5. Restore the origin; pane returns to idle within ~3 polls.
6. Unload/reload the plugin — no leaked timers (check by confirming requests stop hitting the server).

## Then

- Commit. Update `STATUS.md` with what surprised you.

## Likely traps

- Polling `{origin}/health` where origin accidentally ends in `/v1` → still 200 here, which *hides* the bug until P2. Normalize and strip a trailing `/v1` now, even though it doesn't matter yet (AC5b groundwork).
- `fetch` without `no-store` → browser caches a stale snapshot.
- Awaiting the fetch inside the sample loop without a timeout → one hung request stalls every subsequent sample.
- Client registering inside an effect only → silent non-activation.
