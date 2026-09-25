# dsh-slot-health — overnight build (survives compaction; ≤30 lines)

Building a dsh web plugin. Resume state: `agent/STATUS.md` (**read this first**).
Spec/orchestration: `agent/SPEC.md`. Packaging knowledge: `skills/dsh-out-of-tree-plugin/SKILL.md`
— read its **"Corrections learned the hard way"** before writing any package/build/client code.

Read `STATUS.md` → it names the current phase + next 3 steps. Read **only** that one phase file
(`agent/phases/P<n>-*.md`). Then **start writing files.**

## The failure that killed the last attempt — do not repeat it

It read ~8 files, formed a design in its head, wrote nothing, hit the output token limit twice,
and compaction returned an empty summary. **Zero bytes of P1 reached disk.**

- **Read at most 3–4 files, then WRITE something.** You may always read more after.
- Never announce "I have a complete design" without a file written in the same turn.
- Smallest file first (e.g. `src/shared/types.ts`), commit, then continue.
- Design decisions go in `agent/NOTES.md` as you make them — not in your head, not in chat.

## Never do these

- Never `git push`. Never touch `origin`. Commit locally after each verified phase.
- Never kill/restart `:3080` (dsh), `:8080` (llama-server), `:11434` (ollama). Acceptance port `:3090`.
  **Never start/load/pull a model on `:11434` (ollama) — it OOMs the agent's own process.** Probe
  ollama read-only (GET `/api/version`, `/api/ps`, `/api/tags`); the human does any model load.
- Never `pkill dsh`/`pkill node` to free a port — that pattern matches the **sacred `:3080`** too
  (same cmdline shape, different pid). If `:3090` is already yours, **reuse it**; killing anything
  only by verified pid number. See SKILL.md "Acceptance port".
- Never POST to `:8080`. You are served by that single slot — you would deadlock yourself.
- Never read `agent/PLAN.md` (~7k tok). Everything needed is in the phase file.
- Never claim an AC passed that you did not observe. No browser → visual checks go to
  `ACCEPTANCE.md` as `pending-human`.
- Never let the API key appear in output, logs, or commits. Never trust a PID in a doc:
  `pgrep -x llama-server`.

## How to work

Write to disk constantly; think briefly. Unwritten reasoning is lost reasoning.
One slice = one small change → verify → commit; don't get ahead of your last verification.
Update `STATUS.md` after every phase: done · in flight (exact file/function) · next 3.
Prefer `rg` over whole files; `curl` + unit tests over trying to see the UI.
Stuck twice on the same thing? Write the blocker in STATUS.md, change approach, keep moving.
Low on window? Stop cleanly at a phase boundary — a finished P4 beats a half-finished P7.
