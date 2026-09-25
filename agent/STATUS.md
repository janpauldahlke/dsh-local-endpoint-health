# `dsh-slot-health` — Status

**Updated:** 2026-09-25 — **P0 DONE** (`090a524`) · **P1 host+client slice DONE** (`2069b8a`)
**Phase:** **P1 (vertical slice)** complete — poll `/health` → route → client pane idle/unreachable

Laws live in **`AGENTS.md`** (auto-loaded, survives compaction) — not repeated here.
Facts live in **`ENV.md`**; style in **`STYLE.md`**; packaging gotchas in **SKILL "Corrections learned the hard way"**.

## P1 — what landed this run

- **`src/shared/types.ts`** — `HealthSnapshot` + `HealthRouteResponse` (JSON `{...snapshot, origin}`) single source of truth.
- **`src/host/collect.ts`** — `/health` poller. **Never throws.** State table locked: fetch-exception/timeout/≥500 → `unreachable`; 2xx/3xx + body `status==="ok"` → `idle`; else → `unknown`. `latencyMs` on completed requests only (`null` when unreachable). `lastError` carries most-recent failure, reset to `null` on good sample. Timeout = 2 s module constant.
- **`src/host/config.ts`** — Standard Schema v1 `{ origin }`; **`DEFAULT_ORIGIN`** = `http://127.0.0.1:8080`.
- **`src/host/index.ts`** — route returns `{...snapshot, origin}`; `ctx.effect()` runs the 1 Hz sampler loop.
- **`src/client/store.ts`** — module-level self-chaining fetch at 1 Hz vs `/api/dsh-slot-health`, `inFlight` guard, refcounted subscribe/unsubscribe, `cache:'no-store'`, per-tick 2500 ms `AbortController`. Two-stage abort: `'timeout'` → `"poll timed out after 2500 ms"`; `'stopped'` → no error.
- **`src/client/useSlotHealth.ts`** — React binding `{ snapshot, error, lastAttempt }`.
- **`src/client/SlotBody.tsx`** — 3 branches: transport-error → last-known origin + error; no-sample → "waiting for first sample…"; live → state chip + latency + elapsed + lastError. **`SlotTitle.tsx`** — live dot via `useSlotHealth`.
- **`src/client/index.tsx`** — `TAB_ID='dsh-slot-health'`; `sidebarRightTabs.register` + `slots.inject('sidebar.right.pane.tab'/'…tab.title')`.

## Verified this run (agent-side)

- **AC1** — origin pointed at dead port `:59999` via `cordis.patch.yml` config → route reads `unreachable`, `lastError:"connection refused"`, confirmed **poll 1** (≤3). Origin 8080 restored after.
- **AC2 (host-side)** — live origin → `state:idle`, `ok:true`, `latencyMs:1`, **`sampledAt` advances ~1 s/poll**. Client 1 Hz re-render = pending-human.
- Served client bundle (8881 B, `rev=…-50`) contains all current markers (`waiting for first sample`, `sidebar.right.pane.tab`, …).

## Next 3

1. [x] Commit P1 host + client slice → `2069b8a` (build artifacts + `src/` + `agent/` docs).
2. [ ] pending-human: browser — rightbar tab renders; live = idle + "updated N s ago" **advances**; dead port = unreachable + error + age; chat stays usable.
3. [ ] P2 slot meat — extend `HealthSnapshot` with per-slot data (base fields never reinterpreted).

## Checkpoints

- [x] PLAN approved · Q1–Q10 LOCKED · AC1–AC13 · SPEC/STYLE/phases P0–P9 · `AGENTS.md`
- [x] **P0 scaffold** — activates on `:3090`; `lib/` committed; browser render pending-human
- [x] **P1 vertical slice** — host sampler + route + client poller + 3-branch pane; AC1/AC2 host-verified
- [ ] P2 slot meat → P3 wedged → P4 errors → P5 auth → P6 chip → P7 metrics → P8 backends → P9 ship

## pending-human

- **P1 browser check (first morning task):** open token URL (`/tmp/dsh-3090.log`); rightbar tab `dsh-slot-health` renders. Live → idle + elapsed advances; dead port → unreachable + last error + age; chat UI stays usable.

Keep ≤55 lines. Rewrite, don't append.
