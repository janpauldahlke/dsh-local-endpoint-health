# SPEC — `dsh-slot-health` (v0 build)

**Role:** thin orchestrator. Read this **once** at session start, then read **one phase file at a time**.
**Authority:** [`PLAN.md`](PLAN.md) is the *product* spec, [`ENV.md`](ENV.md) the *verified facts*, [`STATUS.md`](STATUS.md) the *resume interface*. This file only orders the work.

---

## 0. Context discipline (READ THIS FIRST — it is a hard requirement, not advice)

The local model runs in a **32k** slot with **12288** reserved for output → **~14–16k usable** after DSH's system prompt and tool schemas. Measured doc costs:

| File | ~tokens | When to read |
| --- | --- | --- |
| `SPEC.md` (this) | ~2.0k | **Once**, at start |
| `ENV.md` | ~2.7k | Once, at start (facts you will reuse) |
| `STATUS.md` | ~0.8k | Once at start; **rewrite after every phase** |
| `STYLE.md` | ~1.6k | **Once, at P1** (first time you render UI). Match gpu-monitor exactly — the panes sit side by side |
| `phases/Pn-*.md` | ~0.7–1.5k each | **One at a time, just before that phase** |
| `PLAN.md` | **~7.1k** | **DO NOT READ during the build.** Read only if a phase file says "consult PLAN §X" — and then read *that section*, not the file |
| `SKILL.md` | ~2.1k | Only in P0, and only the sections P0 names |

Measured working set at P0: SPEC + STYLE + ENV + STATUS + P0 ≈ **8.3k of ~14–16k**. That headroom is deliberate — it's room to *work*.

> ⚠ **Publish gate (human only):** `agent/` and `skills/` are tracked in git so checkpoints are durable — but they are **private working briefs** and must **not** ship in a public release. Before any push/publish, the human removes `agent/` + `skills/` (SKILL publish rule 3: "no ENV.md / overnight STATUS dumps"). You never push, so this is never your problem — but do **not** add publish-oriented cleanup to a build commit, and do not delete these docs to "tidy up".

**Rules:**

1. **Never read `PLAN.md` wholesale.** It is a human artifact; every build-relevant fact is already distilled into a phase file or `ENV.md`. Reading it costs half your window.
2. **Never read two phase files at once.** Finish, verify, checkpoint, then open the next.
3. **Prefer `rg` over `Read`.** Need one fact? Grep for it (`rg -n '/v1/slots' agent/ENV.md`) instead of re-reading a file.
4. **Assume you will be compacted mid-phase.** Compaction is a *remote* summarizer, so it does not blow your window — but it **loses precision**. Therefore: anything you cannot afford to lose goes **to disk immediately** (STATUS.md / NOTES.md), never held in context. After a compaction, re-read `STATUS.md` + the current phase file (~3k) and continue; do **not** try to reconstruct the past from memory.
5. **Budget check before each phase:** read `STATUS.md` (~0.8k) + phase file (~2k) + whatever code you must touch. If that plus your working set exceeds ~10k, split the phase rather than compacting blindly.
6. **Write small.** Per protocol rule 6: a large file is several edits, not one giant write. Never emit a deliverable as a chat reply.

## 0.1 Anti-oneshot contract (this has failed before — treat as law)

A previous run of this exact setup **thought for an hour, wrote nothing, then exceeded context.** The work died with zero artifacts. These rules exist to make that impossible. They are not suggestions.

**The first-10-minutes rule.** Within your first ~10 minutes you MUST have written something to disk. Not thought about writing — written. Concretely, in this order:

1. Read `SPEC.md` §0, §2, §3. Read `STATUS.md`. Read `phases/P0-scaffold.md`. **Stop reading.**
2. Append to `STATUS.md` a line: `## Session <timestamp> — starting at P0`. That's your first disk write; it costs nothing and proves the loop works.
3. Begin P0. Build the smallest thing that exists (a `package.json`), verify it, commit.

**Hard caps:**
- **No plan/research phase longer than ~10 minutes.** If you find yourself composing a large design in your head or in chat, **stop and write it into `NOTES.md` in pieces**, then continue. Unwritten reasoning is lost reasoning.
- **Never emit a file as a chat reply.** Chat is not storage (protocol rule 6). If it's not in a file, it does not exist.
- **One slice = one file or one small change → write → verify → commit.** Never get more than one slice ahead of your last verification (protocol rule 2).
- **Every ~20 minutes of work, touch `STATUS.md`.** Rewrite it after every meaningful step; it is the resume interface for your future self, who will have *no memory* of this one.
- **If you are uncertain what to do next, read `STATUS.md` — not more specs.** It is the authority on where you are.

**Your checkpoint test:** at any moment, if the session died right now, could a fresh agent with zero memory open `STATUS.md` and know (a) what's done, (b) what's in flight, (c) the next 3 steps, (d) how to verify? If no, fix `STATUS.md` **before** continuing. That is the whole game.

**Budget your night.** There are 10 phases. You will not finish all of them, and that is **fine and expected** — a clean stop at P4 with a working, committed, honest plugin beats a half-finished P7. Pace to the window (protocol rule 7). When you feel yourself deepening one phase, ask whether the next phase's *vertical* value is higher.

**On being compacted:** you will be, probably more than once. It is survivable *only* because of the above. After a compaction: re-read `STATUS.md` + current phase file (~3k tokens), re-run the current phase's verify step to learn where you actually are, and continue. Do **not** re-read everything, and do **not** trust your memory of what you already did — check the disk (`git log --oneline`, `ls src/`, `git status`).

---

## 1. Locked identifiers (do not re-derive)

Canonical table lives in [`ENV.md`](ENV.md) §"Canonical identifiers". Short version: package name / patch row name / ModuleLoader `id` are all **`dsh-slot-health`** (these three must be identical or the client silently never activates); route is `/api/dsh-slot-health`; internal slot id `slot-health`.

The repo *directory* is `dsh-local-endpoint-health` — a filesystem fact, **not** drift. Do not rename it. Do not touch `origin`.

## 2. Standing laws (every phase)

- **Git:** commit after each verified phase. **Never push.** Never force-push, never touch remotes/tags. **`agent/` and `skills/` ARE tracked** (as of 2026-09-24) — so `STATUS.md` / `NOTES.md` updates are part of your commit. That is deliberate: the protocol requires every round to close on a *committed* checkpoint, and STATUS.md is the resume interface. Commit docs **together with** the code they describe.
- **Sacred:** never kill/restart `:3080` (primary dsh), `:8080` (llama-server), `:11434` (ollama). Never restart llama-server to gain a flag. Acceptance runs on **`:3090`**.
- **Read-only toward the inference server.** GET only. Never POST to llama-server (`/slots/{id}?action=...`, `/completion`, `/tokenize`). **Critical:** you are served by that same `-np 1` server — a POST would occupy the only slot, so your own next inference queues behind your test and the run hangs unrecoverably. See [`phases/FIXTURES.md`](phases/FIXTURES.md).
- **Never log, print, or render the API key.** Not in the pane, not in console, not in a commit message, not in NOTES.md.
- **If blocked twice on the same thing:** write it in `STATUS.md`, switch approach, keep moving (protocol rule 8).
- **Never claim an AC passes unless you observed it.** UI/visual ACs need a human; record them `pending-human` with exact repro steps in `ACCEPTANCE.md`. Faking a pass is the one unforgivable error here — this project is literally about not lying.

## 3. Phases

Order is deliberate: **vertical slice first** (P1 proves the whole pipeline end-to-end before any depth), then meat, then honesty layers, then breadth. Each phase is independently committable and leaves the plugin working.

| # | File | Deliverable | ACs |
| --- | --- | --- | --- |
| P0 | [`phases/P0-scaffold.md`](phases/P0-scaffold.md) | Package skeleton from blueprint; activates on `:3090` | AC7 (partial) |
| P1 | [`phases/P1-vertical-slice.md`](phases/P1-vertical-slice.md) | **End-to-end:** poll → route → pane shows `reachable`/`unreachable`/`idle` | AC1, AC2 |
| P2 | [`phases/P2-slot-meat.md`](phases/P2-slot-meat.md) | `/slots` parsing, busy/free, host-side age latch, prompt + decode progress | AC3 |
| — | [`phases/FIXTURES.md`](phases/FIXTURES.md) | **Read at P2, reuse after.** Stub server for states you cannot produce live — and why POSTing to `:8080` would hang the run | enables AC2–AC5b, AC10, AC12 |
| P3 | [`phases/P3-wedged.md`](phases/P3-wedged.md) | Status labels + `wedged` heuristic + meaty subtitles | AC4 |
| P4 | [`phases/P4-error-section.md`](phases/P4-error-section.md) | Six distinguishable error states; silent-meatless impossible | AC5, AC5b, AC11 |
| P5 | [`phases/P5-auth-backoff.md`](phases/P5-auth-backoff.md) | Key config precedence; 10s backoff on 401 with instant recovery | AC10 |
| P6 | [`phases/P6-dock-chip.md`](phases/P6-dock-chip.md) | Chip readable with pane closed; all states distinguishable | AC9 |
| P7 | [`phases/P7-metrics-enrichment.md`](phases/P7-metrics-enrichment.md) | `/metrics` gauges/counters, capability detection, cumulative-counter honesty | AC6, AC12 |
| P8 | [`phases/P8-backends.md`](phases/P8-backends.md) | Ollama thin (verified) + vLLM doc-sourced (labeled unverified) | AC13 |
| P9 | [`phases/P9-readme-acceptance.md`](phases/P9-readme-acceptance.md) | Operator README + acceptance notes; final AC sweep | AC7, AC8, all |

**Dependencies:** P1 requires P0. P2–P6 require P1. P7 requires P2 (needs the latch for delta math). P8 requires P4 (thin backends must degrade through the error vocabulary). P9 last.

If you run out of window/time: **stop at a phase boundary**, update STATUS.md, leave the tree working. A finished P4 is worth more than a half-finished P7 — P1–P4 alone already beat the "is it dead?" panic that motivated this.

## 4. Definition of done (v0)

PLAN §5, restated as a checklist:

- [ ] `dsh plugin --profile web add /home/hagbard/dev/dsh-local-endpoint-health` activates the bundle
- [ ] Rightbar tab **and** dock chip both present; chip legible with pane closed
- [ ] llama.cpp adapter shows busy/idle/unreachable + prompt progress + decode count + age
- [ ] `wedged` only on evidence, never on a bare timer; prefers `busy` when unsure
- [ ] All six error states visually distinct; `/v1` misconfiguration named, never shown as `idle`
- [ ] `/metrics` rows present when 200, **invisible** when 501/404; counters labeled lifetime or delta'd
- [ ] Ollama thin adapter works against live `:11434`; vLLM labeled doc-sourced and excluded from acceptance
- [ ] README: origin+key config, `/v1` trap, states, tiers, gpu-monitor sibling, `streamIdleTimeoutMs` tip
- [ ] Coexists with gpu-monitor on `:3090`; uninstall removes it cleanly
- [ ] Nothing sacred was restarted; no `git push` ever happened

## 5. Verification toolkit (copy-paste, all read-only)

```sh
K=$(tr '\0' '\n' < /proc/$(pgrep -x llama-server|head -1)/environ | sed -n 's/^LLAMA_API_KEY=//p')
curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health          # 200, no key
curl -s -m 3 -H "Authorization: Bearer $K" http://127.0.0.1:8080/slots | head -c 400  # meat
curl -s -m 3 -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $K" http://127.0.0.1:8080/v1/slots   # 404 — the trap
curl -s -m 3 -H "Authorization: Bearer $K" http://127.0.0.1:8080/metrics | rg -v '^#'  # gauges/counters
curl -s -m 3 http://127.0.0.1:11434/api/ps | head -c 200                               # ollama thin
dsh web --profile web --port 3090 --no-open                                           # acceptance boot
dsh --profile web --dump-config | rg -i slot-health                                    # composition check
```

Check `:3090` is free first. Kill **only** your own acceptance process, by the pid you started — never by a pattern like `pkill dsh`.
