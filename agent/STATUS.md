# `dsh-slot-health` — Status

**Updated:** 2026-09-25 — **P0/P1 DONE** (`090a524`/`2069b8a`) · **P2–P5 on disk + verified** · **P6 dock chip in flight**
**Phase:** **P6 dock chip** — chip in `conversation.composer.dock`, hidden while pane open, one shared state module.

Laws live in **`AGENTS.md`** (auto-loaded) — not repeated here. Facts in **`ENV.md`**; style in **`STYLE.md`**; packaging gotchas in SKILL "Corrections learned the hard way."

## Done — P2–P5 (this run)

- **P2 slot meat + host age latch** — `src/shared/types.ts`: `SlotSample[]` on `HealthSnapshot` (latch fields `null`-when-n/a, never 0). `src/host/collect.ts` decodes `/slots`; `src/host/latch.ts` stamps `busySinceMs`/`busyAgeMs`/`ttftMs` host-side (`/slots` payload has no timestamps). `src/client/SlotBody.tsx` renders per-slot rows + meter.
- **P3 wedged** — busy with `id_task` not advancing / `has_next_token` false. **P4 errors** — two failure layers (transport vs endpoint) + `slots === null` → `slotsError` (the "key?" state). **P5 auth** — key precedence via env, 10 s retry for rotation.
- **Tests** — `test/latch.test.mjs` (13/13) for latch math; `tools/fixture-server.mjs` for live AC runs. Build + `tsc --noEmit` clean.

## Verified (agent-side) vs pending-human

- **P2 LIVE-verified** on `:8080`: idle→busy→idle observed; `busyAgeMs` advances, `ttftMs` latches on first decode.
- **P3/P4/P5:** code present, AC runs partial (see ACCEPTANCE.md) — pending-human / needs fixture.
- **P1 browser check** still pending-human (rightbar tab renders, elapsed advances).

## P6 in flight — dock chip

- `paneState.ts` refcounted open tracker (chip renders `null` while pane mounted); `slotState.ts` pure derivation `{snapshot,error,lastAttempt,now} → {state,dot,label,title,stale}` consumed by **both** chip and pane (cannot disagree); `SlotDockChip.tsx`; `index.tsx` registers `SlotDockSeat` → `conversation.composer.dock` (`id:'slot-health'`, order -10), `onOpen → ctx.sidebarRight.openTab`; `SlotBody.tsx` calls `setPaneOpen` on mount/unmount.
- **AC9:** chip alone distinguishes busy / idle / error·auth / unreachable / stale, tab closed. **AC10:** unit test asserts state→label map.

## Next 3

1. [ ] Write `slotState.ts` + `paneState.ts` + `SlotDockChip.tsx`; wire `index.tsx` + `SlotBody.tsx`.
2. [ ] Rebuild → verify `lib/client.js` has dock registration; write slotState unit test; commit P2–P5, then P6.
3. [ ] ACCEPTANCE.md P6 AC writeups; final STATUS; P7 metrics next.

## pending-human

- P1 browser: rightbar tab renders; live = idle + elapsed advances; dead port = unreachable + error + age.

Keep ≤55 lines. Rewrite, don't append.
