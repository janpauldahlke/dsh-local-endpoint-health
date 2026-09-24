# P9 — README, acceptance notes, final sweep

**Goal:** ship it. The plugin works; now make it *installable by a stranger* and prove every AC.

**Read:** this file + `PLAN.md` **§5, §6, §7 only** (the DoD, deliverables, and AC list — you need the exact wording to self-check). Do **not** read the rest of PLAN.

**Requires:** P0–P8 (or a clean stop at a phase boundary).

---

## Deliverables

**D6 — Operator README** (repo root, `README.md`). This is the public face; gpu-monitor's README is the quality bar. Must cover:

- One-paragraph what/why: it explains *why nothing is happening*, not just whether the server is up. Sibling to gpu-monitor: **hardware truth vs inference-lane truth**. Cross-link [dsh-gpu-monitor-nvml](https://github.com/janpauldahlke/dsh-gpu-monitor-nvml).
- **Install:** `dsh plugin --profile web add <path-or-github-ref>`, then restart `dsh web` + hard-refresh. Removal command. Note `lib/` is committed so no toolchain needed (if that's the choice made in P0).
- **Config:** origin + optional API key, key precedence (explicit → `LLAMA_API_KEY` env → none). **The `/v1` trap** with a concrete wrong-vs-right example — this is the single most likely user error and it fails *silently*.
- **States:** what each label means and what to *do* about it (`idle` / `busy` / `wedged` / `unreachable` / auth error / unknown / stale). Include the honest note that `busy` is preferred over a false `wedged`.
- **Backend tiers:** llama.cpp full · Ollama thin (no slot visibility) · vLLM **doc-sourced, unverified**. Say plainly what each can and cannot show.
- **`--metrics`:** enrichment rows need it; llama-server started without it just shows fewer rows. Mention `llama-server --metrics` / `LLAMA_ARG_ENDPOINT_METRICS`.
- **`streamIdleTimeoutMs` tip:** for long-prefill workloads, raising DSH's client idle timeout helps; this pane explains the wait but deliberately does not change the setting.
- **Data honesty section** (mirror gpu-monitor's): where every number comes from, that `/metrics` counters are server-lifetime, that rate gauges read 0 while idle, that no timestamps exist in `/slots` so ages are latched by the plugin.
- **Platform support table** (Linux/Windows/macOS — HTTP polling is portable; richness follows the server).
- **Not** included: no `ENV.md`, no overnight STATUS/NOTES dumps, no secrets, no key values (SKILL publish rule 3).

**D7 — Acceptance notes** (`ACCEPTANCE.md` at repo root, or a README section): what a human should see on `:3090`, step by step, including how to reproduce the interesting cases — a busy turn, an unreachable origin (dead port, *not* by killing `:8080`), and the `/v1` misconfiguration.

## Final AC sweep

Walk AC1–AC13 and record each as pass / fail / not-verifiable-here, with the evidence. Be honest: **vLLM is not verifiable on this host** and must be recorded as such, not as a pass. `wedged` is verified via synthetic snapshots (P3), not by wedging a real server — record that too.

Also re-confirm the two invariants that are easy to break late:
- **AC7:** uninstall removes the pane cleanly; **gpu-monitor still works** when both are installed.
- **AC8:** no sacred process was restarted at any point in the run. Check your own shell history / STATUS log honestly.

## Your call

- README length and voice. gpu-monitor's is detailed and opinionated (it has a "Data honesty" section and an ASCII mock) — matching that register is good, but don't pad.
- Whether to include screenshots. gpu-monitor has a `media/` dir; if you can capture `:3090` cleanly, do it, but **never** screenshot anything showing a key value.
- Whether acceptance notes live in the README or a separate file.

## Verify

1. `git status` clean; `lib/` + sources committed; **`agent/` + `skills/` tracked and committed** (they are the durable checkpoint — but see the publish note below); `node_modules/` **not** committed.
2. `git log --oneline` shows one commit per phase, no pushes. `git remote -v` untouched.
3. Fresh-profile install → pane + chip appear; uninstall → gone; gpu-monitor unaffected.
4. README renders correctly (check the tables and code fences).
5. Every claim in the README is either verified or explicitly labeled unverified.
6. Grep the whole tree for the API key value → **must be absent**, including in README examples (use `<your-key>` or `LLAMA_API_KEY`).

## Then

Final `STATUS.md` rewrite: what shipped, AC results, known gaps, and — importantly — **what you'd do differently**, since that becomes next session's skill material. Leave the handoff a fresh agent can resume cold (protocol rule 10).

**Do not push.** The human publishes.
