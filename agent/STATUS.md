# `dsh-slot-health` — Status

**Updated:** 2026-09-25 ~14:30 — **REVIEW2 (card chrome + collapsible sections) committed and
verified on `:3090`.** `:3080` untouched (human's server — not restarted).

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging
gotchas in SKILL "Corrections learned the hard way."

## REVIEW2 §3 — DONE

- `4812a74`: shared `card.tsx` (`CollapsibleCard` — GpuCard chrome verbatim: radius 8,
  currentColor-18% border (crit-red / warn-amber on escalation), 8px/10px header + 6% hover
  wash, ▸ chevron 90° rotation, body hairline, role=button + Enter/Space + aria-expanded,
  per-card localStorage override that beats the expand policy).
- One card per slot (`dsh.slotHealth.card.slot.${id}`): state-word accent (idle green / busy
  blue / wedged red), collapsed preview per REVIEW2 §2b — idle `ctx 40% · dec 0 · busy —`,
  busy `busy 22s · dec 892 · prompt 5%`; expanded while busy/wedged, collapsed when idle.
  Slot-error (401/404/5xx) → crit `SLOTS` card (`auth`/`slots`), expanded by default.
- `slotTone()` in slotState.ts = P3 wedged heuristic (300 s = streamIdleTimeoutMs + prompt
  fully processed + zero decoded; long prefills and decoding requests never wedged) + 7 tests.
- `MetricsBlock` → `MetricsCard` (`dsh.slotHealth.card.metrics`): collapsed by default, preview
  `43/19.5 tok/s · acc 65%` (per-stat titles), window as header meta, not-fresh → dimmed.
- `row.tsx`: meter is now `{ ratio, tooltip }` (GPU API — dedicated meter tooltips) + `caption?`
  (context row shows free tokens). **83/83 tests**, tsc + build clean.
- Served `:3090` combo re-fetched (38 KB, 200): all card markers present; live route healthy
  (slot 0 busy from the agent's own request, metrics fresh, acc lifetime n=106072).

## Environment (re-probed ~14:30)

- llama-server pid **419949** on `:8080` (key in env, stub — never print). dsh `:3080` pid
  **440235** (human's — never restart it). Acceptance `:3090` pid **454046** (token:
  `/tmp/dsh-3090.log` line 1).

## Committed so far

- `4812a74` cards (REVIEW2) · `d48af77` docs · `021f2cb` UI pass · `7e9bc1e` hardening ·
  `749714d` P7 client · `8216613` P7 engine · `e93a772` P6 chip · `9b0f9ac` P2–P5 ·
  `2069b8a` P1 · `090a524` P0

## Next 3

1. [ ] Human visual pass: card chrome / hover wash / chevron rotation / collapse persistence /
   previews / both themes — checklist in `agent/ACCEPTANCE.md`.
2. [ ] P3 `wedged` is now code-complete (`slotTone`); pending-human: observe a real wedged
   server (or fixture) turning a slot card crit-red.
3. [ ] per-pos rows appear once a spec request completes live (optional).

## pending-human

- REVIEW2 card-UX checklist (ACCEPTANCE.md). Real wedged-server observation.

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
