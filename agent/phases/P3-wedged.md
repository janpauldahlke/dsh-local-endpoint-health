# P3 — Status labels + `wedged` heuristic

**Goal:** turn raw numbers into a verdict an operator can act on, without ever crying wolf.

**Read:** this file only. **Not** `PLAN.md`.

**Requires:** P2 (needs busy state + the age latch + decode count).

---

## Decisions already locked (Q3)

- **Subtitle @ 120s** of busy ∧ prompt-complete ∧ `n_decoded == 0`.
- **`wedged` label @ 300s** of the same. 300s is not arbitrary — it is exactly DSH's `streamIdleTimeoutMs`, i.e. the moment the client gives up while the server still holds the slot.
- **Both thresholds configurable.**
- **Prefer `busy` over false `wedged`.** A false alarm trains the operator to ignore the pane, which is worse than no pane.

The heuristic is **evidence-based, not a bare timer**: it requires prompt processing to be genuinely *complete* (`n_prompt_tokens_processed >= n_prompt_tokens`, or progress 1.0) **and** zero tokens decoded. Busy with prompt still climbing is healthy prefill, not wedged.

## Label set

`unreachable` · `idle` · `busy` · `unknown` · `wedged` (plus the error states P4 adds). Subtitles carry the meat: `prompt 8294/8294 · decoded 0 · 187s`.

## Your call

- Whether `wedged` is a distinct color/word or `busy` + an escalating subtitle. The plan permits either; pick what reads fastest at 2am.
- How the hint text is phrased. It should say what to *do*: wait, or kill llama (not DSH).
- Whether to show a "prefill in progress" hint separately from "no tokens yet" — the distinction is real (prompt still climbing vs prompt done, nothing out).
- Where thresholds live (config schema) and their defaults.

## Verify

1. **AC4 via fixture** ([`FIXTURES.md`](FIXTURES.md)): the `busy-prefill` scenario (prompt still climbing) must stay **busy** at any age, never `wedged` — this is the single most important assertion in the phase. The `busy-nodecode`/`wedged` scenarios give you controllable age.
2. **Deterministic thresholds:** feed synthetic snapshots (busy ∧ prompt complete ∧ decoded 0, ages 119s / 121s / 299s / 301s) through your testable seam. Assert subtitle at 120, label at 300. Prefer a real unit test over eyeballing — it survives compaction and re-runs cheaply.
3. Confirm a healthy long prefill (progress increasing at 200s) never yields `wedged`.
4. Confirm thresholds are actually configurable (change one, observe it).
5. **`pending-human`:** a genuinely wedged server. You must **not** try to wedge `:8080`. Record it in `ACCEPTANCE.md`.

Write the synthetic-snapshot test to disk — it is the only way to verify AC4 without touching a sacred process.

## Then

Commit. Update `STATUS.md`.

## Likely traps

- Basing `wedged` on age alone → fires during legitimate long prefills, exactly the false alarm the plan forbids.
- Reading `n_prompt_tokens` as "prompt total for this request" when it's retained context — use the processed/total pair.
- Letting a counter reset (`id_task` change) clear the age latch *and* the wedged state inconsistently.
