# Environment pin (do not guess)

**Pinned:** 2026-09-24 · verified read-only against the live host
**Workspace:** `/home/hagbard/dev/dsh-local-endpoint-health/`
**Package root:** the repo root itself (`package.json`, `src/`, `lib/`, `cordis.patch.yml` at top level). `agent/` and `skills/` are **private working briefs, but tracked in git** so checkpoints are durable; the human strips them before any publish.

## Git LAW

- **`git commit` locally: ALLOWED and expected** after every verified slice.
- **`git push`: FORBIDDEN.** A remote (`origin` → github.com/janpauldahlke/dsh-local-endpoint-health) **is configured** — do not use it. Publishing is a human gate (see skill §"Publish later").
- **Never force-push. Never add/modify remotes. Never tag releases.**
- **`agent/**` and `skills/**` ARE tracked** (un-ignored 2026-09-24) — so PLAN/SPEC/STATUS/NOTES/phases **are** committed. This satisfies the long-horizon protocol's "committed checkpoint" rule properly: the resume interface now lives in git history, not just on disk. Commit doc updates **together with** the code they describe.
- They remain **private working briefs**: the human strips `agent/` + `skills/` before any public publish (skill publish rule 3). Since you never push, this is never your action — just don't delete them to "tidy up", and don't add publish-cleanup to a build commit.
- `.gitignore` correctly ignores `node_modules/`, lockfiles, and scratch. `lib/` is **tracked on purpose** (built output, so install needs no toolchain).

## DeepSeek Harness

| Item | Value |
| --- | --- |
| CLI | `dsh` → `/home/hagbard/.local/bin/dsh` |
| Version | **`0.1.6-alpha.2`** (verified: `dsh --version`) |
| Running instance | `node /home/hagbard/dev/deepseek-harness/apps/cli/lib/bin.js web` on `:3080` |
| Target profile | `web` (`~/.dsh/profiles/web/`) |
| Product surface | `dsh web` only (not Electron desktop for v0) |

All plugin APIs, slots, and client bundle rules must match **this** version. Do not assume docs samples from other versions without checking the installed tree.

## Canonical identifiers — **LOCKED, do not drift** (Q1)

Product name is **`dsh-slot-health`**. Use these exact strings; convention mirrors the gpu-monitor blueprint (full name for package/loader/patch row, short form for route + internal ids).

| Where | Exact value |
| --- | --- |
| `package.json` → `name` | `dsh-slot-health` |
| `cordis.patch.yml` → row `name` | `dsh-slot-health` |
| ModuleLoader `id` (client wrapper) | `dsh-slot-health` |
| Host API route | `/api/dsh-slot-health` |
| Internal slot / dock `id` | `slot-health` |
| Rightbar tab title | `Slot Health` (blueprint uses full name `GPU Monitor` for the tab) |
| Dock chip label | `SLOT` or similar **short** form (blueprint uses short `GPU` on the chip) |

Tab title ≠ chip label by design: the blueprint uses the full name for the tab (`title: () => 'GPU Monitor'`) and a terse word on the chip. Registration seats, verified from blueprint `src/client/index.tsx`: `inject = ['slots','sidebarRight','sidebarRightTabs']`; `ctx.sidebarRightTabs.register(definition)` for identity, then keyed injection into `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title`.

`package.json` `name` **must** equal the `cordis.patch.yml` row `name` **must** equal the ModuleLoader `id` — skill hard rule #5; mismatch = silent non-activation.

**Known cosmetic mismatch (deliberate, not drift):** the git repo directory and `origin` remote are still named `dsh-local-endpoint-health`. That is a **filesystem/remote fact**, so paths in these docs legitimately read `/home/hagbard/dev/dsh-local-endpoint-health/`. Do **not** "fix" this by renaming the directory (it would break the workspace) or the remote (pushing/remote changes are forbidden). Every *product* identifier is `dsh-slot-health`. If the human wants repo and package to match, that is a **publish-time** action (GitHub rename + `origin` URL), gated on the human — recorded so nobody re-litigates it mid-build.

## Sacred processes — DO NOT DISTURB

The overnight agent **depends** on already-running services. Stealing or restarting them burns the run — and the model serving *you* is the llama-server below.

**Forbidden without explicit human instruction in a new message:**

- Killing, restarting, reconfiguring, or rebinding ports of the **primary `dsh web`** instance (`:3080`)
- Stopping, restarting, unloading, or re-pointing **`llama-server`** (`:8080`) or **ollama** (`:11434`)
- `pkill` / `kill` patterns aimed at `dsh`, node harness, llama, vLLM, ollama, or similar
- Changing `CUDA_VISIBLE_DEVICES`, driver reloads, nvidia persistence toggles
- Occupying the GPUs with heavy unrelated workloads that starve the coding model
- **Adding `--api-key`/`--metrics` flags to the live llama-server** — it cannot be restarted to gain features. Design around what it already exposes.

**Allowed:**

- Read-only: `curl` against `:8080` (with key), `nvidia-smi`, `--dump-config`, `/proc/<pid>/environ` inspection, logs
- Start a **second** `dsh web` on a **different `--port`** for acceptance (default `3090` if free)
- Build/install the plugin package; prefer an isolated dev/acceptance profile when unsure
- Local `git commit` after verified slices

If acceptance seems to require restarting primary dsh or llama: **stop, write the blocker in `STATUS.md`, continue other slices.** Do not "just bounce" those services.

## The endpoint being monitored (verified live)

`llama-server` from `/home/hagbard/dev/llama.cpp/build-cuda/bin/`, serving **Qwen3.8-27B Uncensored HauHau Q6_K_P**:

```
-m  .../Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf
--host 127.0.0.1 --port 8080
-ngl 99 -ts 1,1 -c 32768 -np 1 --flash-attn on
--spec-draft-model .../...-FastMTP-32K.gguf --spec-draft-ngl all
--spec-type draft-mtp --spec-draft-n-max 3
--reasoning off --reasoning-budget 0
```

Consequences for the design — **all of these were probed, not assumed:**

| Fact | Evidence | Implication |
| --- | --- | --- |
| **Auth is ON.** `/slots` and `/props` return **401** without a key | probed | v0 collector **must** send an auth header or the entire meaty path is dead. AC3 cannot pass without it. |
| `/health` is **open** (200, no key) | probed | Reachability works unauthenticated; auth failure must not be reported as "unreachable". |
| Key comes from env **`LLAMA_API_KEY`** (llama.cpp `--api-key` env fallback, `common/arg.cpp:3447`) | source + `/proc/<pid>/environ` | Both `llama-server` **and** the running `dsh` process already have it in their env, same value. Since the plugin lives in the dsh host process, `process.env.LLAMA_API_KEY` is the zero-config path. Config precedence: explicit key → env var name (default `LLAMA_API_KEY`) → no header. **Never log or render the key.** |
| **⚠ `/v1` prefix trap.** `http://127.0.0.1:8080/v1/slots` → **404**, but `/v1/health` → **200** | probed | DSH's configured `baseURL` is `.../v1` (it is the OpenAI-compat base). `/slots`, `/props` live at the **server root**, NOT under `/v1`. A collector that blindly appends `/slots` to `baseURL` gets 404 while `/health` still returns 200 → pane reads "reachable, idle" forever and **never shows any meat, with no error**. Config must separate **server origin** (`http://127.0.0.1:8080`) from the OpenAI base, or strip a trailing `/v1` before hitting `/slots`. Treat 404 on `/slots` as a *named* "endpoint does not expose slots" state, never as idle. |
| `-np 1`, single slot | argv | "slot busy" == "no new chat can start". The headline insight of the whole pane. |
| `-c 32768` | argv | `n_ctx` pressure has a known denominator. |
| Speculative **draft-mtp** active | argv + `/props` | `/slots` reports `speculative: true`; can be shown as a fact, not decoded as "second model". |
| **`/metrics` → 200 VERIFIED** (re-verified 2026-09-25 01:06 after restart with `--metrics`) | probed | Live payload captured below. 401 without key, **200 with key**. `--metrics` is now default in `~/.local/bin/llama-dsh` (escape `LLAMA_METRICS=0`), all 3 exec paths, `bash -n` + stub-server dry-run verified. |
| PP/TG rates are **direct gauges**, not derivatives | `tools/server/README.md` §GET /metrics | `llamacpp:prompt_tokens_seconds` + `llamacpp:predicted_tokens_seconds` are Gauges — **no delta math needed**. (An earlier draft of this doc wrongly claimed rates required differencing counters; corrected.) |
| ⚠ **Rate gauges read `0` while idle** | probed | Both `*_tokens_seconds` gauges were `0` on an idle server despite `prompt_seconds_total 11.22` / `tokens_predicted_seconds_total 6.10` being non-zero. So a rate of 0 is **ambiguous**: idle, or genuinely stalled. Never render `0 tok/s` as "server is stuck" — cross-check `requests_processing` / `is_processing` first. If the pane wants rates while idle, derive them from the `_total` counters instead. |
| `timings_per_token: false` | `/props` | Irrelevant to `/metrics`; only affects per-token timing inside `/slots` params. |
| ⚠ **Vision is currently OFF** on the running server (no `--mmproj` in argv) | probed | `settings.yaml` still advertises `input: [text, image]` for this model. Mismatch: image requests will fail at the server, not in DSH. Flag to human — do not "fix" by restarting the server. |
| **`/slots` has no timestamps** | probed payload | "Time since busy", age, and live TTFT **must be computed host-side** by latching the `is_processing` false→true transition. Do not hunt for a server field. |

### Endpoint matrix (probed with the live key, 2026-09-24)

| Path | no auth | with key | Note |
| --- | --- | --- | --- |
| `/health` | 200 | 200 | `{"status":"ok"}` — open |
| `/v1/health` | 200 | 200 | alias, also open |
| `/slots` | **401** | **200** | the meat |
| `/props` | **401** | **200** | model + default gen settings |
| `/v1/slots` | 404 | **404** | ⚠ does not exist — see trap above |
| `/v1/props` | 404 | **404** | ⚠ does not exist |
| `/metrics` | **401** | **200** ✓ | re-verified 01:06 |
| `/v1/models` | 200 | 200 | thin-backend fallback signal |

### `/slots` payload actually available (single slot, array of 1)

`id`, `id_task`, `is_processing`, `n_ctx`, `speculative`,
`n_prompt_tokens`, `n_prompt_tokens_processed`, `n_prompt_tokens_cache`,
`next_token[].n_decoded`, `next_token[].n_remain`, `next_token[].has_next_token`,
`params{...}` (incl. `n_predict`, `speculative.types`).

That set is sufficient for: busy/free, prompt progress (`processed`/`n_prompt_tokens`), decode count (`n_decoded`), context pressure (`n_ctx`), and a task-change signal (`id_task` — useful to detect a *new* request occupying the slot). Everything else in §3.2 is conditional.

Note `n_prompt_tokens` reads ~8369 **while idle**: that is retained prompt context, not live work. Idle detection must use `is_processing`, never prompt-token count alone.

## Acceptance runtime

```sh
# ensure the port is free first, then:
dsh web --profile web --port 3090 --no-open
```

- Primary operator UI stays up on `:3080`. Inference stays up on `:8080` / `:11434`.
- Verify composition: `dsh --profile web --dump-config | grep -i endpoint-health`
- Verify route: `curl -s http://127.0.0.1:3090/api/<your-route>`
- Coexistence check: gpu-monitor pane and this pane both healthy on `:3090`.

## Blueprint (copy from, do not re-derive)

`/home/hagbard/dev/dsh-gpu-monitor-nvml/` — shipped product of the previous overnight run, already on GitHub. Contains working `package.json` (dual-face `exports` + `dsh.bundle` + `dsh.client`), `build.mjs` (two esbuild configs: host ESM, client CJS ModuleLoader closure), `cordis.patch.yml`, rightbar tab slot injection, 1 Hz self-chaining `fetch` polling, inline-styles-only rendering.

This plugin is **strictly simpler**: pure HTTP polling, **no native deps** (no `node-nvml`), no C-FFI. Reuse the shape; drop the NVML.

Toolchain present: node v22.22.0, npm 10.9.4, esbuild in the blueprint's `node_modules`.
