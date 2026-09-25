# `dsh-slot-health` — Status

**Updated:** 2026-09-25 — **P0–P6 done, agent-verified** · P6 = `e93a772` · **P6 AC9 + P0/P1/P2 browser checks pending-human**
**Phase:** complete through P6. Next phase = **P7 metrics**.

Laws live in **`AGENTS.md`** (auto-loaded) — not repeated here. Facts in **`ENV.md`**; style in **`STYLE.md`**; packaging gotchas in SKILL "Corrections learned the hard way."

## Done — P6 (this run)

- `paneState.ts` refcounted open tracker (chip renders `null` while pane mounted); `slotState.ts` pure derivation
  `{snapshot,error,lastAttempt,now} → {state,dot,label,title,stale}` consumed by **both** chip and pane (cannot disagree);
  `SlotDockChip.tsx`; `index.tsx` registers dock seat → `conversation.composer.dock` (`id:'slot-health'`, order -10),
  `onOpen → ctx.sidebarRight.openTab`; `SlotBody.tsx` calls `setPaneOpen` on mount/unmount.
- **AC10 machine-verified:** served `:3090` bundle has the dock registration + chip code; `deriveChip` state→label map unit-tested
  25/25 (repo total 36/36); gpu-monitor coexists (distinct slot id, same `order: -10` — no collision); API with key → `state:"idle"`.
- **CLI moved on:** dsh checkout is now `0.1.6-alpha.2` — `--profile`/`--dump-config` are **global** flags
  (`dsh --profile web --dump-config`), plugin mgmt is `dsh plugin --profile web list`. Plugin loads fine under the new CLI.

## Done — P2–P5 (`9b0f9ac`)

- P2 latch (`busySinceMs`/`busyAgeMs`/`ttftMs`, host-stamped — `/slots` has no timestamps) + per-slot rows/meter; LIVE-verified
  idle→busy→idle on `:8080`. P3 wedged, P4 transport-vs-endpoint errors + `slotsError`, P5 env-key precedence + 10 s rotation retry.

## Environment facts (2026-09-25)

- Sacred: `:3080` (dsh web, pid 24993), `:8080` (llama-server, key len 6 in env — never print), `:11434` (ollama).
- Acceptance `:3090` = pid 282715, `LLAMA_API_KEY` set (API returns real slots, `contextUsed` ~22k); token in `/tmp/dsh-3090.log` line 1.
- Bundle: 5 MB combo URL (see `/tmp/combo-url.txt`) — entry served via `??` combo only; single-file `client.js?rev=` 404s by design.

## Next 3

1. [ ] Human morning check: P6 AC9 chip states + P0/P1/P2 pane carry-over (`ACCEPTANCE.md` → "Morning check").
2. [ ] Fix any morning-check findings; commit.
3. [ ] P7 metrics — fresh phase file from `agent/SPEC.md`.

## pending-human

- P0/P1: tab renders; idle + "updated N s ago" ticks.
- P6 AC9: chip alone distinguishes busy / idle / error·auth / unreachable / stale; no jitter while typing; light+dark readable;
  no collision with gpu-monitor chip.

Keep ≤55 lines. Rewrite, don't append.
