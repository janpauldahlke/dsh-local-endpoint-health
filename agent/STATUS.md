# `dsh-slot-health` — Status

**Updated:** 2026-09-24 23:58 — **P0 DONE** (verified, committed) · **P1 NEXT**
**Phase:** **P1 (vertical slice)** — poll `/health` → route → pane reachable/unreachable/idle

## Session log

- P0 done: dual-face scaffold verified on `:3090` — host route 200 `{"ok":true,…}`, client in combo URL (3510 B, wrapper id === package name), dump-config row present → all 11 checks ✅, see `ACCEPTANCE.md`
- Client 404 mystery resolved: entries only served via `??` combo URL; single-file form 404s by design. `&amp;` in HTML hrefs must be unescaped before curl
- `dsh web` implies web profile: never pass `--profile` again; boot with clean env (`-u DSH_WEB_URL -u DSH_SHELL -u DSH_SESSION_ID`)
- Host entry needs `main: "lib/index.js"` — harness defaults to `index.js` and fails without it
- Register handler shape: `{ kind: 'exact', path, handler }`; two `ctx.effect()` (sampler + unregister)
- P1 prep: collector seam exists — `collectSnapshot()` in `src/host/collect.ts`, swap-ready

## Next 3

1. [ ] P1: read `phases/P1-vertical-slice.md` + `SPEC.md` §0/§4 (AC1–AC13); build `/health` poller → `src/host/collect.ts` real snapshot → pane shows reachable/unreachable/idle (3s stale dim)
2. [ ] Verify with curl against live llama-server on `:8080` (read-only!) + a dead port for unreachable; keep 1 s poll, backoff later in P5
3. [ ] Commit P1; update STATUS + ACCEPTANCE

## LAW

1. Disk+git only. Chat lies.
2. **Git: `commit` after every verified phase. `push` FORBIDDEN** — `origin` exists, do not use it. No force-push, no remote/tag changes. Publishing is a human gate.
3. Sacred: never kill `:3080`/`:8080`/`:11434`. Acceptance on `:3090`. Never restart llama-server to gain a flag. **Never load an Ollama model** (starves the coding agent's GPUs). See [`ENV.md`](ENV.md).
4. `agent/**` + `skills/**` **are tracked** (un-ignored 2026-09-24) → commit STATUS/NOTES/SPEC updates **with** the code they describe. They are private briefs: the human strips them before any publish. You never push.
5. **Context discipline is a hard requirement** — 32k slot, ~14–16k usable. Read `SPEC.md` §0 first. Never read `PLAN.md` wholesale (~7.1k tokens); one phase file at a time.

## Name — LOCKED

**`dsh-slot-health`** everywhere it's a product identifier. Canonical table in [`ENV.md`](ENV.md) §"Canonical identifiers". Repo *directory* stays `dsh-local-endpoint-health` — a filesystem fact, **not** drift; do not rename it. Repo/package mismatch is a **publish-time** human action.

## Checkpoints

- [x] PLAN approved + de-ballasted · Q1–Q10 LOCKED (§11) · AC1–AC13 (§7)
- [x] Live probes: auth required, `/v1/slots` **404 trap**, `/metrics` **200**, counters **cumulative**, rate gauges **0 idle**, Ollama `/api/ps` = `{"models":[]}`
- [x] `~/.local/bin/llama-dsh` patched: `--metrics` default (escape `LLAMA_METRICS=0`), 3 exec paths, `bash -n` + stub dry-run verified
- [x] **`SPEC.md`** · **`STYLE.md`** · **`phases/P0–P9`**
- [x] **P0 scaffold** — activates on `:3090`; `lib/` committed (no-toolchain install); browser tab render = pending-human
- [ ] P1 vertical slice → P2 slot meat → … → P9 ship

## Next-3 detail & gotchas

- **Config = origin, never DSH `baseURL`** (`.../v1` → `/v1/slots` 404 while `/v1/health` 200 = silent-meatless, AC5b).
- **Key precedence:** explicit → env `LLAMA_API_KEY` → none. Never log/render the key. 1s poll healthy, ~10s on 401 (AC10).
- **No timestamps in `/slots`** → busy-age/TTFT latched host-side on `is_processing` false→true. Idle ≠ zero prompt tokens (~8369 retained) → use `is_processing`.
- **`/metrics` = enrichment only**, degrades invisibly. Counters lifetime, not per-request (AC12).
- **Placement:** rightbar tab **and** dock chip; chip hides while pane open (reference-counted `paneState`).
- **Backends:** llama.cpp full · Ollama thin (live, verifiable) · vLLM doc-sourced **unverified, excluded from acceptance**.
- **Styling:** match gpu-monitor exactly — `color-mix(currentColor)` theming, two-tier palette, `tabular-nums`, 3s stale dim. See `STYLE.md`.

## pending-human

- **P0 browser check (first morning task):** open token URL (see `ACCEPTANCE.md` §Morning check); confirm rightbar tab `dsh-slot-health` renders placeholder. Server-side activation fully proven; only browser execution unverified.
