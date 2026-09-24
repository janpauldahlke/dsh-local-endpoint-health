# dsh-slot-health — overnight build (survives compaction; keep under 25 lines)

You are building a dsh web plugin. Full spec: `agent/SPEC.md`. Resume state: `agent/STATUS.md`.

## Where you are

Read `agent/STATUS.md` FIRST — it names the current phase and the next 3 steps.
Then read only that one phase file: `agent/phases/P<n>-*.md`.

## Never do these

- Never `git push`. Never touch `origin`. Commit locally after each verified phase.
- Never kill/restart `:3080` (dsh), `:8080` (llama-server), `:11434` (ollama). Acceptance port `:3090`.
- Never POST to `:8080`. You are served by that single slot — you would deadlock yourself.
- Never read `agent/PLAN.md` (~7k tokens, half your window). Everything you need is in the phase file.
- Never claim an AC passed that you did not observe. No browser → visual checks go to `ACCEPTANCE.md` as `pending-human`.
- Never let the API key appear in output, logs, or commits.

## How to work

- Write to disk constantly; think briefly. Unwritten reasoning is lost reasoning.
- One slice = one small change → verify → commit. Don't get ahead of your last verification.
- Update `agent/STATUS.md` after every phase: done, in flight (exact file/function), next 3.
- Prefer `rg` over reading whole files. Prefer `curl` + unit tests over trying to see the UI.
- Stuck twice on the same thing? Write the blocker in STATUS.md, change approach, keep moving.
- Low on window? Stop cleanly at a phase boundary. A finished P4 beats a half-finished P7.
