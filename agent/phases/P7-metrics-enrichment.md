# P7 — `/metrics` enrichment (capability-detected, degrades invisibly)

**Goal:** add the server-side rows when `/metrics` exists — and make them vanish without a trace when it doesn't.

**Read:** this file + `ENV.md` §"`/metrics`" rows. **Not** `PLAN.md`.

**Requires:** P2 (needs the `id_task` latch for delta math).

---

## Verified inputs (live probe, 2026-09-24 22:50, pid 42466)

`GET {origin}/metrics` → **401 without key, 200 with key**. Prometheus text format, `llamacpp:` prefix. Actual values captured after ~2 requests:

```
llamacpp:prompt_tokens_total 9467            llamacpp:prompt_seconds_total 11.2223
llamacpp:prompt_tokens_cached_total 0        llamacpp:tokens_predicted_total 167
llamacpp:tokens_predicted_seconds_total 6.10 llamacpp:n_decode_total 89
llamacpp:n_tokens_max 9635                   llamacpp:n_busy_slots_per_decode 1
llamacpp:prompt_tokens_seconds 0             llamacpp:predicted_tokens_seconds 0
llamacpp:requests_processing 0               llamacpp:requests_deferred 0
llamacpp:spec_decode_num_draft_tokens_total 240
llamacpp:spec_decode_num_accepted_tokens_total 88
llamacpp:spec_decode_num_drafts_total 80
llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="0"} 47
                                             {position="1"} 28   {position="2"} 13
```

Cross-checked against the server's own log line-for-line (`prompt eval 9467 tokens`, `eval 167 tokens`, `n_tokens 9635`, `draft acceptance = 0.36667 (88 accepted / 240 generated), mean len = 2.10`). The data is real and consistent.

## Three traps, all verified — read before coding

1. **Counters are cumulative since server start, not per-request.** After exactly one request every `_total` equalled that request's totals. So raw `accepted / draft` = **all-time** acceptance (0.367 here), not the current request's. Any per-request figure must be **delta'd across `id_task` boundaries** using the P2 latch. → **AC12**
2. **Rate gauges read `0` while idle** even though `_total` counters are non-zero. `prompt_tokens_seconds 0` / `predicted_tokens_seconds 0` on an idle server. A `0` is **ambiguous**: idle, or genuinely stalled. Never render `0 tok/s` as "stuck" — cross-check `requests_processing` / `is_processing`. If you want a rate while idle, derive from the `_total` counters.
3. **`/metrics` may be 501** (flag not set) or 404 (backend lacks it). Rows must **hide cleanly** — no hole in the layout, no error styling. It's enrichment; `/slots` remains authoritative.

## What to build

- Capability detection: probe `/metrics` once per session (and on a 501/404, stop probing — don't hammer a route that will never exist). Cache the verdict; re-probe on config change or server restart detection.
- A small Prometheus **text parser**. No dependency — the format is trivial (`name{labels} value` lines, `#` comments). Don't pull in a library.
- Rows worth showing (your pick, in priority order): **`requests_deferred`** (queue depth — "your request is waiting, that's why nothing happens"), **`requests_processing`**, context high-water (`n_tokens_max` vs `n_ctx`), PP/TG gauges, **draft acceptance** (delta'd per request).
- The per-position acceptance series (`position="0|1|2"`) is a genuinely interesting MTP diagnostic — mean draft length 2.10 of a max 3. Optional; only if it fits without clutter.

## Your call

- Which of the above earn a permanent row vs a collapsed detail section.
- Whether to show lifetime or delta'd acceptance, **provided you label which**. "draft acceptance 37% (lifetime)" vs "this request 37%".
- Whether PP/TG are shown as gauges (server-averaged, may read 0) or derived from counter deltas (more work, more honest while idle). Given trap #2, derived may be the better product — your judgment.
- Whether to keep a tiny history for these. PLAN §3.3 says no charts in v0; a single previous-sample retention for delta math is *not* a chart and is required.

## Verify

1. `/metrics` 200 → rows appear with sane values. Compare against `curl` + the server log; they must agree.
2. **AC6:** the pane must not become a tok/s clone. Server PP/TG are secondary rows, never the hero.
3. **AC12:** after a fresh request, confirm the acceptance figure is either labeled lifetime or correctly delta'd (send two requests of different sizes; a lifetime number barely moves, a delta'd one tracks the second request).
4. Idle rate gauges read `0` → confirm the pane does **not** show a stall.
5. **Degrade test:** point the collector at a server without `/metrics` (or simulate 501) → rows vanish, layout has no hole, no error styling, `/slots` state unaffected.
6. Confirm the parser doesn't choke on the `{position="0"}` labeled series or on the `# HELP`/`# TYPE` lines.

## Then

Commit. Update `STATUS.md`.

## Likely traps

- Polling `/metrics` at 1s forever after a 501 → pointless log noise and wasted work.
- Treating counters as gauges → absurd cumulative "rates".
- Letting `/metrics` failure poison the whole snapshot (it must be an independent try/catch, like gpu-monitor's per-field isolation).
