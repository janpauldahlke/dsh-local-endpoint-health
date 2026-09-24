# FIXTURES — how to verify without touching the real server

**Read this at P2** (first phase needing a busy slot), then reuse through P9. ~1.3k tokens.

---

## The problem this solves

You are served by the **same** `llama-server` you are monitoring, and it has **`-np 1`** — one slot. Therefore:

- **You cannot produce a busy slot by chatting.** You have no browser; and `POST /completion` to `:8080` would occupy the only slot, so **your own next inference queues behind your test** and the run hangs. This is a self-deadlock, it happens unattended, and it is unrecoverable without a human.
- **So: never POST to `:8080`.** GET only (SPEC §2). Not even "a tiny 1-token request". Not even once.
- A *live* busy-slot check is a **human morning task**, not yours. Say so in STATUS.md instead of faking a pass.

## The answer: a canned stub server

Write `tools/fixture-server.mjs` — a plain `node:http` server, **no dependencies**, default port **`:3099`** (never 3080/3081/3090/8080/11434). It serves the same routes llama-server does, from a scenario you select, so every state is reproducible on demand.

Suggested interface (your design): `node tools/fixture-server.mjs --scenario idle|busy-prefill|busy-nodecode|wedged|401|v1trap|unknown|nometrics --port 3099`

Scenarios to cover, with the fields that matter:

| Scenario | Serves | Proves |
| --- | --- | --- |
| `idle` | `/health` 200, `/slots` `[{is_processing:false, n_prompt_tokens:8369, n_ctx:32768, …}]`, `/metrics` 200 | AC2; **idle with retained prompt tokens** (the ~8369 trap) |
| `busy-prefill` | `is_processing:true`, `n_prompt_tokens_processed` climbing toward total, `n_decoded:0` | AC3, healthy long prefill — must stay **busy**, never `wedged` |
| `busy-nodecode` | prompt complete, `n_decoded:0`, stable `id_task` | AC4 with controllable age |
| `wedged` | as above but the stub has been in that state past your thresholds | AC4 label |
| `401` | `/slots` → 401, `/health` → 200 | AC5, AC10, and auth-vs-unreachable distinction |
| `v1trap` | `/v1/health` 200, `/v1/slots` **404**, `/slots` 200 | **AC5b** — the silent-meatless trap |
| `unknown` | 200 on everything with an unrecognizable body | AC5 state 5 |
| `nometrics` | `/slots` fine, `/metrics` → **501** | P7 degradation, AC12 |

Copy the real payload shapes from [`ENV.md`](../ENV.md) (the `/slots` key list and the live `/metrics` dump are both there, verbatim) so your fixtures match production byte-shape. For age-dependent scenarios, let the stub **advance a virtual clock** or accept `?age=180` so you can hit 119/121/299/301s deterministically without waiting five minutes.

Point the plugin's configured origin at `http://127.0.0.1:3099` for these tests — that is a **config change**, not a process change, so nothing sacred is touched.

## What fixtures can and cannot prove

| Verifiable by you, alone | **Needs human eyes** (mark as such, don't claim a pass) |
| --- | --- |
| Collector logic, state derivation, thresholds, deltas, backoff timing (AC2,3,4,5,5b,10,12,13) | Chip legible with pane closed (AC9) |
| Host route JSON via `curl` | Light/dark theme contrast, layout not wrapping |
| `lib/` builds; `--dump-config` shows the row | Tab/chip actually *appears* in a browser |
| Install/uninstall composition (AC7, partly) | "Pane looks right", screenshot quality |
| No key material in output or commits | Real end-to-end busy turn through DSH chat |

For the right-hand column: **write the exact steps into `ACCEPTANCE.md`** as a morning checklist for the human, and record them in STATUS.md as `pending-human`, not `pass`. Claiming an unverified AC as passed is the one kind of lying this project cannot tolerate — it is, literally, a product about not lying.

## Rules

- Fixtures live in `tools/` and **are committed** (they're product-adjacent test infrastructure, not private briefs).
- Kill **only** the stub, **by the pid you started**. Never `pkill node`, never a pattern — you'd take out dsh and llama-server.
- Never bind a fixture to a sacred port, even "for a second".
- If a scenario is impossible to fake honestly, record it as `pending-human`. Do not approximate it into a pass.
