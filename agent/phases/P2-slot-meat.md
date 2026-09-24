# P2 — Slot meat (`/slots`), busy state, host-side age latch

**Goal:** the pane stops being a reachability light and starts explaining *why* nothing is happening. This is the phase that justifies the whole project.

**Read:** this file + `ENV.md` §"`/slots` payload actually available" + §"the `/v1` prefix trap". **Not** `PLAN.md`.

**Requires:** P1 verified end-to-end.

---

## Verified inputs (do not re-derive; these were probed live)

`GET {origin}/slots` with `Authorization: Bearer <key>` → 200, array of 1 slot:

`id`, `id_task`, `is_processing`, `n_ctx` (32768), `speculative` (true), `n_prompt_tokens`, `n_prompt_tokens_processed`, `n_prompt_tokens_cache`, `next_token[].n_decoded`, `next_token[].n_remain`, `next_token[].has_next_token`, `params{...}`.

Three facts that will bite you if ignored:

1. **No timestamps anywhere.** Busy-age and live TTFT must be **latched host-side**: record `Date.now()` when `is_processing` transitions false→true; clear on true→false. There is no field to read.
2. **`n_prompt_tokens` reads ~8369 while idle** — that is *retained* context, not live work. Idle detection must use `is_processing`, never a token count.
3. **`id_task` changes per request.** Use it to detect a *new* request occupying the slot (and later, to reset per-request deltas). Without it, a second request looks like the first one ageing.

## What to build

- Extend the collector to fetch `/slots` alongside `/health`. Auth is required here — for this phase, read the key from `process.env.LLAMA_API_KEY` as a stopgap (P5 makes it proper config). **Never log or render the key**, not even in an error message.
- Derived state: `busy` when `is_processing` is true; `idle` when false and reachable.
- Metric rows to surface: slot busy/free, prompt progress (`n_prompt_tokens_processed` / `n_prompt_tokens`, with %), tokens decoded (`n_decoded`), busy age (latched), live TTFT (age at first `n_decoded > 0`), context pressure vs `n_ctx`.
- The host-side latch must live in the **host**, not the client — the client may reconnect or hard-refresh, and age must survive that.
- Handle `-np N` generically (array) even though this host is `-np 1`; don't hardcode index 0.

## Your call

- Exact row ordering, labels, and which rows collapse. Every number needs an unambiguous name (gpu-monitor's rule: "GPU util" is never confused with "Mem util").
- Whether prompt progress is a meter bar, a percentage, or both.
- How to present `n_prompt_tokens_cache` (cache hits are genuinely interesting during multi-turn prefill, but it's not core).
- Whether `speculative: true` earns a row now or waits for P7's acceptance counters.

## Verify

**You cannot produce a real busy slot** — POSTing to `:8080` would occupy the only slot and hang your own next inference. Build [`FIXTURES.md`](FIXTURES.md)' stub server first (read it now), then:

1. Rebuild, boot `:3090`. Pane rendering is `pending-human`; verify everything below via `curl` on the host route and via unit tests on the pure state module.
2. **AC3 via fixture:** point the plugin origin at the stub's `busy-prefill` scenario → pane goes **busy** and shows *at least one* of: slot busy flag, prompt progress, or decode count — **not** busy-with-zero-detail.
3. Also verify against the **real** server's *idle* state (GET is safe): `/slots` returns `is_processing:false` with ~8369 retained prompt tokens → pane must read **idle**, not busy. This is the trap that matters most.
4. Watch fixture prompt progress climb and `n_decoded` move; confirm TTFT appears and is sane (real host: ~900 tok/s prefill, ~27 tok/s TG, so several-second prefill on ~9k tokens is normal).
5. **Latch test:** switch fixture `id_task` → confirm age restarts near 0, not continuing from the previous request.
6. **Latch test — do this as a unit test on the host module, not in a browser** (you have none): assert that a hard client reconnect does *not* reset busy age, i.e. age is owned host-side. Add it to `ACCEPTANCE.md` as a visual confirm too.
7. `curl` the host route directly and confirm no key material appears in the JSON.
8. **`pending-human`:** a real busy turn through DSH chat. Write the steps into `ACCEPTANCE.md`; do not claim it passed.

## Then

Commit. Update `STATUS.md`. If any field you expected is absent from the live payload, **write the actual payload shape into NOTES.md** — that's exactly the kind of evidence P0-grade facts deserve.

## Likely traps

- Treating `is_processing: false` + high `n_prompt_tokens` as busy (it's idle with retained context).
- Computing age client-side → resets on refresh, lies about stall length.
- Letting a 401 on `/slots` look like "unreachable" (P4 fixes the vocabulary, but don't make it worse here).
- Appending `/slots` to a `/v1`-suffixed origin → 404. Strip the suffix at the config boundary, once, not at every call site.
