# Plan: Local endpoint / slot health — make “chat is dead” diagnosable

**Status:** planning — human review before any coding
**Workspace home:** `/home/hagbard/dev/dsh-local-endpoint-health/` (package root = repo root)
**Harness pin:** `dsh` **0.1.6-alpha.2** (verified installed) — see [`ENV.md`](ENV.md)
**Packaging lessons:** [`../skills/dsh-out-of-tree-plugin/SKILL.md`](../skills/dsh-out-of-tree-plugin/SKILL.md)
**Blueprint to copy from:** `/home/hagbard/dev/dsh-gpu-monitor-nvml/` (dual-face package, `build.mjs`, `cordis.patch.yml`) — this plugin is strictly simpler: pure HTTP, **no native deps**
**Sibling in this series:** [dsh-gpu-monitor-nvml](https://github.com/janpauldahlke/dsh-gpu-monitor-nvml) (hardware metrics; this plugin is **inference endpoint** state)
**Incident that motivated this:** a long-running prefill occupied the single `llama-server` slot (`-np 1`) while the DSH client hit `pi-ai stream idle timeout after 300000ms`. The operator read “chat is broken” while the server was in fact still working. Silence without explanation is the enemy — not any particular workload.

This document is a **product + scope + usefulness** spec. It deliberately avoids APIs, file layouts, and implementation recipes. The implementing agent invents those from the pinned harness, the blueprint repo, and the out-of-tree skill.

**Sacred processes:** never kill/restart primary `dsh` / llama / ollama — [`ENV.md`](ENV.md). Acceptance boots use a throwaway port (e.g. `:3090`).

---

## 1. One-sentence goal

Ship an **installable DSH Web plugin** that shows **live, meaty health of the local inference endpoint** — not a lone `isRunning` boolean — so an operator can tell “server is busy on a long prefill” from “server dead” from “DSH timed out but the lane is still busy.”

---

## 2. Why this exists

### 2.1 What GPU monitor does *not* answer

[dsh-gpu-monitor-nvml](https://github.com/janpauldahlke/dsh-gpu-monitor-nvml) answers: util, VRAM, power, which PIDs hold memory.

It does **not** answer:

| Question | Why it matters |
| --- | --- |
| Is the endpoint accepting requests? | Server down vs UI frozen |
| Is the **single slot** (`-np 1`) busy? | New chats cannot start |
| Has prompt processing finished but **zero tokens decoded** for minutes? | Classic wedged / pre-decode stall |
| Is a long silent stretch **plausibly healthy work** (prefill in progress)? | Operator should wait vs kill |
| Did **DSH** give up (idle timeout) while the server is still working? | Explains “timeout but fans spinning” |

Those gaps caused a real false panic: the endpoint was fine, the **slot** was occupied by a long prefill, and the **client watchdog** fired first.

### 2.2 Who benefits

**A. Local-model operators (primary)**
Anyone running `llama.cpp` / Ollama / vLLM / LM Studio behind `llm-pi-ai` with a local `baseURL`. Especially single-slot servers (`-np 1`) and any workload with long prefills / slow TTFT: minutes of silence can be normal; silence without explanation is not.

**B. Same humans who installed GPU monitor**
Two panes, two truths: **hardware** vs **inference lane**. Together they replace ad-hoc `curl /slots` + `nvidia-smi` + guessing.

**C. Registry / dsh.pub audience**
Lots of skins and pets; thin on “local serving ops.” Natural sibling to a GPU pane for the local-llama crowd.

### 2.3 Concrete night this would have saved

1. Operator sends a request that triggers a long prefill on the only slot.
2. Pane shows: endpoint OK · slot **busy** · prompt in progress · **decoded 0** · age 3m · hint “prefill in progress; slow first token can be healthy.”
3. At 5m DSH times out; pane still shows slot busy — operator knows to wait or kill **llama**, not reinstall DSH.
4. Another “hi” while slot busy → pane shows “blocked: slot occupied,” not mysterious non-response.

### 2.4 Operating facts (keep in mind for copy + heuristics)

| Fact | Implication for the pane |
| --- | --- |
| Long prefill with no decoded tokens can be **healthy busy** | Never render “busy + decoded 0” as failure by itself; age + hint, prefer `busy` over crying `wedged` |
| Client `streamIdleTimeoutMs` (default 300s) can fire while the server still holds the slot | Pane must outlive the client error and keep telling the truth |
| A busy single slot explains “new chat won’t start” | Say exactly that in the hint text |
| This host’s `llama-server` requires an **API key** (`/slots`, `/props` answer 401 without it; `/health` is open) | The collector **must** support an optional auth header, or the meaty path is dead on arrival — see §5.1 |

---

## 3. Metric meat (not a boolean)

A sole **`isRunning` / reachable** bit is **not** the product. DSH already surfaces turn-level **tok/s** (and related timing) on completed/in-flight assistant UI. This pane must add **server-lane** meat the chat card does not explain live.

### 3.1 Core vocabulary (always show when known)

| Metric / signal | Why it helps |
| --- | --- |
| **Reachability + health latency** | Up/down vs slow/dying endpoint |
| **Auth status** (401/403 seen) | Key missing/wrong is a config bug, not a dead server |
| **Slot busy / free** (and busy/N if parallel) | Explains “new chat won’t start” on `-np 1` |
| **Prompt tokens processed / total** (+ %) | Prefill in progress vs done |
| **Tokens decoded so far** | Separates prefill stall from generation |
| **Time since request became busy** | Age of the stall — **latched host-side**; `/slots` exposes no timestamps |
| **Time to first decode** (live TTFT once decode starts) | Makes long silent waits legible — also host-side latched |
| **Idle age while busy ∧ decoded=0** | Wedged heuristic fuel |
| **Context / `n_ctx` pressure** when exposed | Without opening Trajectory |
| **Last HTTP/auth error** | Wrong key, OOM restart, refused connection |
| **Model id** | “What is loaded” without reading argv |
| **Task identity** (`id_task` on llama) | Detects a *new* request taking the slot vs the same one ageing |

### 3.2 Server-side enrichment via `/metrics` — **decided yes (Q8), behind capability detection**

`--metrics` is now **on by default** in `~/.local/bin/llama-dsh`, so after the next restart these are live on the primary target. All names verified from `llama.cpp/tools/server/README.md` §GET `/metrics`:

| Metric | Type | Pane use |
| --- | --- | --- |
| `llamacpp:prompt_tokens_seconds` | **Gauge** | PP rate — direct read, **no delta math** |
| `llamacpp:predicted_tokens_seconds` | **Gauge** | TG rate — direct read |
| `llamacpp:requests_processing` | Gauge | Cross-check on slot busy |
| `llamacpp:requests_deferred` | Gauge | **Queue depth** — "your request is waiting, that's why nothing happens" |
| `llamacpp:n_tokens_max` | Counter | Context high-water mark vs `n_ctx` |
| `llamacpp:spec_decode_num_accepted_tokens_total` / `_draft_tokens_total` / `_num_drafts_total` | Counter | **Draft acceptance ratio** — draft-mtp is active on this host, so non-zero and meaningful |

**Hard rule:** these rows must **hide cleanly** when `/metrics` is 501 (flag not set) or 404 (backend lacks it). Never leave a hole in the layout, never surface it as an error — the pane's core meat comes from `/slots`, and §3.2 is enrichment only.

### 3.3 Do **not** treat as the headline (avoid duplication / noise)

| Avoid as primary | Why |
| --- | --- |
| Replacing DSH’s turn **tok/s** card | Already there; optional secondary “server PP/TG” is fine |
| Raw nvidia util/VRAM | Belongs in gpu-monitor; cross-link in README, don’t fork NVML |
| Fancy charts without state labels | Honesty of **busy/idle/wedged** beats sparkline vanity in v0 |

### 3.4 Status labels (derived from meat, not instead of it)

At least: `unreachable` · `idle` · `busy` · `unknown` · optional `wedged` (heuristic on top of busy + no decode + age).
**False positives prefer `busy` over crying wolf.** Subtitles carry the meat (“prompt 8294/8294 · decoded 0 · 187s”).
Plus distinct **error states** from §3.5 — `unreachable` and `auth-failed` are not the same thing and must not look the same.

### 3.5 Error section (from Q10 — **first-class UI, not a footnote**)

A pane whose data has vanished must **say why**, in userland, without a terminal. Render a named error region in both the pane and the chip:

| Condition | What the user must see |
| --- | --- |
| 401 / 403 | "**Wrong or missing API key**" + which config field to fix. Distinct from unreachable — the server is *up*. |
| `/v1/slots` 404 while `/health` 200 | "**Slots not exposed at this origin** — check for a `/v1` suffix" (AC5b). Silent-meatless must be impossible. |
| `/metrics` 501 / 404 | No error; enrichment rows simply absent, plus a one-line "server metrics unavailable (`--metrics` off)" note. |
| Connection refused / timeout | "**Unreachable**" + last successful update age + attempt count. |
| Backend shape unrecognized | "**Reachable, but not a known server**" + whatever *is* known (latency, `/v1/models`). |
| Stale data (poll failing) | Existing "updated N s ago" **plus** explicit stale marking — never render the last good sample as current. |

Chip states must be distinguishable at a glance: healthy-busy, idle, **error/auth**, unreachable, stale.

### 3.6 ⚠ `/metrics` counters are cumulative-since-startup (verified live)

Observed after exactly **one** request: `prompt_tokens_total 9467`, `tokens_predicted_total 167`, `n_tokens_max 9635`, `spec_decode_num_accepted_tokens_total 88` — each equal to *that single request's* totals, and each matching the server's own `print_timing` log line-for-line (`prompt eval 9467 tokens`, `eval 167 tokens`, `n_tokens 9635`, `88 accepted / 240 generated`). So:

- These are **lifetime** counters, **not** per-request values. Rendering `accepted / draft` raw shows *all-time* acceptance (0.367 here, mean draft len 2.10), not the current request's.
- Any "this request's rate/acceptance" figure must be **delta'd across `id_task` boundaries**, using the same host-side latch that busy-age already needs.
- The two **rate gauges** (`prompt_tokens_seconds`, `predicted_tokens_seconds`) are server-averaged and read **`0` while idle** despite non-zero `_total` counters — a `0` is ambiguous (idle vs stalled). Cross-check `requests_processing` / `is_processing` before implying a stall.
- **Design consequence:** `/metrics` is enrichment and must degrade invisibly. The pane's authoritative state machine stays on `/slots`, which is per-request by construction.

---

## 4. Backends & platforms (findings)

**There is no one uniform “meaty” API across local stacks.** Shared UI vocabulary; **backend adapters** for collectors.

| Backend | Health | Rich slot / decode meat | v0 tier (Q7) |
| --- | --- | --- | --- |
| **llama.cpp `llama-server`** | `/health` | **Best** (`/slots`: processing, prompt progress, decode count) + `/metrics` gauges | **1 — full, verified on this host** |
| **Ollama** | `/api/tags`, `/api/ps` (both probed 200 on `:11434`, 6 models loaded) | **Thin** — what's loaded, no slot/decode progress | **2 — thin, verifiable tonight** |
| **vLLM** | `/health` (liveness only) + `/metrics` (`vllm:` gauges) | Strong *if* metrics present — different shape | **3 — doc-sourced, NOT installed here, excluded from acceptance** |
| **LM Studio / generic OpenAI clones** | often `/v1/models` only | **Reachable + latency** only | 2 — thin (testable against llama's own `/v1/models`) |

See §11.1 for the honesty rules each tier imposes — especially tier 3, which must be **labeled unverified** in README and code, never silently presented as working.

**Cross-platform:**

- **Not Ubuntu-only.** Any OS where the Host can HTTP-poll localhost works (Linux / Windows / macOS).
- **Rich meat** follows what the **server** exposes, not the OS. llama.cpp is portable; vLLM ops are usually Linux+NVIDIA; Ollama is multi-OS but thinner.
- v0 may **document** “full pane experience verified on Linux + llama-server”; other backends degrade to the signals they actually have.

**Architecture implication:** one pane model (`idle/busy/wedged/…` + metric rows); pluggable collectors. Do not fake llama `/slots` fields on Ollama.

---

## 5. Exact goal (v0 Definition of Done)

A profile-installable bundle named **`dsh-slot-health`** (Q1 — repo rename decision Q1a still open, see §11) that:

1. Reads the **operator-configured** target from plugin config: a **server origin** (default `http://127.0.0.1:8080`) **plus an optional API key** sent as the auth header the backend expects. Without the key option the meaty path fails 401 on this very host. Origin must **not** be DSH's `baseURL` verbatim (`.../v1` → `/v1/slots` 404s silently, AC5b).
2. Polls **lightweight** health + **meaty** signals when available (not reachability alone), at **1s** (Q4).
3. Shows **both** a rightbar tab pane **and** a dock chip carrying live status (Q9): status label, **metric rows from §3**, last update age, short human hint. The chip is load-bearing — it must be readable while the pane is **closed**.
4. Ships a **llama.cpp adapter** with full meat, an **Ollama thin adapter**, and a **vLLM adapter written from upstream docs and explicitly labeled unverified** (Q7, §11.1). The pane must not crash or lie when richness is missing (`unknown` + what's known).
5. Degrades honestly: unreachable, **401/auth failure named as such**, `/metrics` 501/404, unknown server shape — never crashes chat.
6. Reads `/metrics` enrichment when present (PP/TG gauges, queue depth, spec-decode acceptance), **hiding those rows cleanly** when absent (Q8, §3.2).
7. Installs like gpu-monitor: `dsh.bundle` + dual-face package + `dsh plugin --profile web add …`.
8. Coexists with gpu-monitor (both panes healthy on the same throwaway port).

**Human acceptance (oracle):**
- Short text turn: pane tracks **busy → idle** and shows prompt/decode progress when the backend provides it.
- Server stopped: **unreachable** within a few polls.
- Long single-slot hold: pane stays **busy** with age + decoded=0 (or equivalent), and does **not** claim healthy idle after a DSH client timeout.

**Verified against the live endpoint (see [`ENV.md`](ENV.md)):** `/slots` (with key) yields `is_processing`, `id_task`, `n_ctx`, `speculative`, `n_prompt_tokens`, `n_prompt_tokens_processed`, `n_prompt_tokens_cache`, `next_token[].n_decoded` — enough for busy/free, prompt progress, decode count, context pressure, and new-task detection. It carries **no timestamps**, so busy-age and live TTFT must be **latched host-side** on the `is_processing` false→true edge. Note `n_prompt_tokens` reads ~8369 **while idle** (retained context): idle detection must use `is_processing`, never prompt-token count alone.

---

## 6. Deliverables (v0)

| # | Deliverable | Notes |
| --- | --- | --- |
| D1 | Installable out-of-tree plugin package **`dsh-slot-health`** | Built artifacts at repo root; patch-only ≠ DoD; `package.json` name ≡ `cordis.patch.yml` row name |
| D2 | Host collector / route | Polls **server origin** (not `/v1` baseURL) + optional key; 1s; 10s backoff on 401; pane works without agent tools |
| D3 | Rightbar tab pane **+ dock chip** (Q9) | Chip readable while pane closed; collapsible pane; empty/error/stale all named |
| D4 | Status + **metric meat** UI **+ error section** (§3.5) | §3 rows; not boolean-only; auth/404/unreachable/stale visually distinct |
| D5 | Adapters: **llama.cpp full · Ollama thin · vLLM doc-sourced** | Q7 + §11.1 tiers; vLLM labeled unverified, excluded from acceptance |
| D6 | Operator README | origin + API key config, `/v1` trap, states, backend tiers, gpu-monitor sibling, `streamIdleTimeoutMs` tip, `--metrics` note |
| D7 | Acceptance notes | What to see on `:3090`, incl. how to reproduce AC5b (paste a `/v1` origin) |

Optional stretch (**not** v0 DoD): generic-OpenAI clone adapter beyond `/v1/models`; agent read-only tool; toasts; multi-endpoint fleet; kill/restart controls. **Ollama and vLLM are no longer stretch** — Q7 moved them into v0 as thin/doc-sourced tiers.

---

## 7. Acceptance criteria (testable)

### AC1 — Endpoint down
No listener on configured baseURL → within ≤ ~3 polls: **unreachable**, last-error/age, chat UI still usable.

### AC2 — Endpoint idle
Healthy server, no in-flight work → **idle**; “updated N s ago” advances.

### AC3 — Endpoint busy (meat required)
In-flight work that occupies capacity → **busy**, and at least one of: slot busy flag, prompt progress, or decode count — **not** busy-with-zero-detail if the llama adapter can see `/slots`-class data. (On this host that requires the configured API key — 401 without it must surface as a **named auth error**, not as `idle` or `unknown`-with-no-reason.)

### AC4 — Wedged / long pre-decode (best-effort)
When signals allow (busy ∧ prompt complete ∧ decoded 0 beyond threshold) → **wedged** or busy + clear subtitle (“no tokens yet · Ns”). Prefer busy over false wedged.

### AC5 — Auth / thin servers
Wrong API key or no slots metadata → **unknown** / auth error + whatever is still known (e.g. reachable via `/health`). No blank crash.

### AC5b — Silent-meatless must be impossible (the `/v1` trap)
Server reachable (`/health` 200) but slots route **404** — e.g. operator pasted `http://127.0.0.1:8080/v1` as the origin → pane must show a **named** state (“endpoint reachable; slots not exposed at this path — check origin/`v1` suffix”), **never** `idle`. Rationale: this failure is invisible otherwise — the pane looks healthy and simply never shows any meat. Verified live: `/v1/slots` → 404 while `/v1/health` → 200.

### AC6 — Not a tok/s clone
Pane DoD does **not** require duplicating DSH turn tok/s as the hero metric; if rates appear, prefer **server PP vs TG** or omit.

### AC7 — Install / uninstall
Fresh throwaway profile/port: install → pane appears; uninstall → pane gone; **gpu-monitor still works** if installed.

### AC8 — Sacred processes
Verification never kills primary `:3080` / `:8080` / `:11434`. Never restarts llama-server to gain a flag.

### AC9 — Dock chip while pane is closed (Q9)
With the rightbar tab **closed**, the dock chip alone must distinguish at minimum: busy, idle, error/auth, unreachable, stale. Rationale: in the motivating incident the pane was closed; a tab the user must know to open cannot prevent the panic.

### AC10 — Auth-failure backoff (Q10)
On repeated 401/403 the poll interval must drop to ~10s (verified by timing the collector's requests, e.g. via server log spacing), and **resume 1s immediately** once the key becomes valid. No unbounded retry storm; no permanent giving-up either.

### AC11 — Error section is specific, not generic (§3.5)
Each of these must render a **distinguishable** message: wrong key (401), `/v1`-suffix misconfiguration (404 on slots), connection refused, unrecognized backend shape, stale poll. A single catch-all "error" string fails this AC.

### AC12 — Cumulative counters never presented as per-request (§3.6)
If draft-acceptance or rate rows are shown, they must be labeled as **server lifetime averages** or delta'd across `id_task`. Rendering raw `spec_decode_num_accepted_tokens_total` as "this request's acceptance" fails this AC. Idle rate gauges reading `0` must **not** be rendered as a stall.

### AC13 — Backend tier honesty (Q7 / §11.1)
Ollama (live on `:11434`, thin) must show what it genuinely knows and **name** what it lacks — never invent llama `/slots` semantics. vLLM adapter must be labeled doc-sourced/unverified in README and code, and is **excluded from v0 acceptance** (not installed on this host).

---

## 8. What it SHOULD do

- Observe **local inference endpoint** state with **named, useful metrics** (§3).
- Prefer **llama.cpp server**-class signals when present; degrade honestly elsewhere.
- Make **long silent work** (slow prefill / slow TTFT) look like work-in-progress, not product death.
- Support **auth** (optional API key per endpoint) as a first-class config value.
- Stay **read-only** toward the inference server in v0 (no restart/kill — sacred-process + trust).
- Match gpu-monitor honesty: stale age, source limits written down.
- Configure target URL + key from **plugin config**, safe local default, key never echoed into the pane or logs.
- Document that raising DSH **`streamIdleTimeoutMs`** helps long-prefill workloads — pane does not change that setting itself.

---

## 9. What it should NOT do (v0)

- **Not** boolean-only health (“running: true”).
- **Not** a workload manager for any particular model feature (prefill length, sidecars, attachments are out of scope).
- **Not** a replacement for Trajectory, session query, or community replay tools.
- **Not** a process supervisor (start/stop llama, OOM killer).
- **Not** a cluster / multi-host orchestrator.
- **Not** scraping GPU metrics (gpu-monitor’s job).
- **Not** pretending Ollama/vLLM expose llama `/slots` fields.
- **Not** requiring Ubuntu or NVIDIA (HTTP poll is enough for baseline; rich meat is backend-dependent).
- **Not** requiring model tools for the pane to function.
- **Not** patch-only delivery as the end state.
- **Not** storing or displaying the API key anywhere except the outbound request header.

---

## 10. Relationship to existing harness pieces

| Existing | Relationship |
| --- | --- |
| `dsh-gpu-monitor-nvml` | Sibling: hardware vs endpoint |
| `llm-pi-ai` + `streamIdleTimeoutMs` | Client gives up; pane explains residual server busy |
| DSH turn timing / tok/s | Client-side; pane adds **server-lane** meat, doesn’t replace the card |
| Trajectory / session log | After-the-fact; this is **live** |
| Settings Models (`baseURL`) | Which endpoint to watch (pane config may mirror it manually in v0) |

**Gap statement:** no first-party Web pane surfaces local OpenAI-compatible **slot/busy + prefill/decode** health the way gpu-monitor surfaces NVML. Trajectory/replay do not close this **live-ops** gap.

---

## 11. Decisions — **LOCKED by human interview, 2026-09-24**

All nine answered in interview. These are decisions, not defaults; the implementing agent does **not** re-litigate them. Evidence behind each is in [`ENV.md`](ENV.md).

| ID | Question | **Decision** | Rationale / constraint |
| --- | --- | --- | --- |
| Q1 | Package name | **`dsh-slot-health`** | Sharper; names the real insight (single-slot occupancy). ⚠ **Open sub-decision Q1a:** repo is already `dsh-local-endpoint-health`, so package ≠ repo. Legal, but gpu-monitor's matched and `dsh plugin add github:<owner>/<repo>` installs under the *repo* name. Human to either rename the repo or accept the mismatch — resolve **before** publishing, not before building. `package.json` `name` and `cordis.patch.yml` row `name` must both be `dsh-slot-health`. |
| Q2 | Watch target source | **Manual plugin config: server origin + optional API key**, default `http://127.0.0.1:8080` | No auto-discovery in v0. Origin, **never** DSH's `baseURL` verbatim — that is `.../v1` and `/v1/slots` → **404** while `/v1/health` → 200 (silent-meatless trap, AC5b). Key precedence: explicit config → env var name (default `LLAMA_API_KEY`) → no header. `~/.dsh/settings.yaml` also lists a **remote** (non-localhost) model that must never be watched by default. |
| Q3 | Wedged thresholds | **Subtitle @ 120s, label @ 300s — both configurable** | 300s is exactly `streamIdleTimeoutMs`; configurable so the pair can be raised together. Heuristic = busy ∧ prompt-complete ∧ `n_decoded == 0`, which the verified `/slots` fields support as *evidence*, not a bare timer. Prefer `busy` over false `wedged`. |
| Q4 | Poll interval | **1s flat** | Matches gpu-monitor (`SAMPLE_INTERVAL_MS = 1000`); payload ~1.5KB from localhost. Keeps "updated N s ago" honest and simple. |
| Q5 | v0 agent tool | **No — pane only** | The tool would be useless in the motivating scenario: the coding agent *is served by that slot*, so a wedged slot means no agent available to call it. Collector should stay a clean function so a tool is a thin later wrapper. |
| Q6 | Toasts | **No** | Needs dockkit/notification API surface — extra risk, zero v0 value. |
| Q7 | v0 backends | **llama.cpp full + Ollama thin + vLLM doc-sourced** | See §11.1 for the three-tier honesty rule this creates. |
| Q8 | Server-side §3.2 enrichment | **Yes — implement behind capability detection** | `--metrics` is now **on by default** in `~/.local/bin/llama-dsh` (escape `LLAMA_METRICS=0`), so after the next human restart `/metrics` → 200. PP/TG are **direct gauges**, not counter derivatives. Rows must hide cleanly on 501/404 — never leave a hole, never error. |
| Q9 | Placement | **Rightbar tab + dock chip showing live status** | The chip is the actual product: in the motivating incident the pane would have been *closed*, and a tab you must open cannot help someone who doesn't know to look. gpu-monitor already ships both, so the blueprint covers it. Chip must be readable while the pane is closed. |
| Q10 | Polling on auth failure | **Keep 1s when healthy; on 401/403 drop to ~10s and surface a visible error section** | A wrong key cannot self-heal, so 1s buys nothing and adds noise. llama.cpp logs `SRV_WRN("unauthorized: Invalid API Key")` **unconditionally per unauthorized request** (`tools/server/server-http.cpp:250`, no verbosity gate) — so a correct key means **zero** log lines at any poll rate. Backoff is only log hygiene for the broken state; recovery resumes 1s immediately once the key works. **New UI requirement from this: a first-class error section in the pane + chip** (see D4/§3.5), so userland *sees* why data is missing instead of staring at a silent pane. |

### 11.1 Backend honesty tiers (from Q7)

Three distinct levels of trust. The pane must make the tier **legible**, so a user never mistakes tier 3 for verified.

| Tier | Backend | Status | Why |
| --- | --- | --- | --- |
| 1 | **llama.cpp** | Full meat, **verified on this host** | `/slots` payload probed live |
| 2 | **Ollama** | Thin, **verifiable tonight** | Running on `:11434` with 6 models (`qwen3.6-35b`, `gemma4`, `mistral-nemo`, `nomic-embed-text`…). `/api/tags`, `/api/ps`, `/v1/models` all → 200 (probed). No slot/decode meat — say so |
| 3 | **vLLM** | **Doc-sourced, NOT verified** | Not installed on this host (binary + Python module both absent). Written from upstream docs only |

**Rules for tier 3 (vLLM) — do not skip:**
- Label it in README and in code comments as **doc-sourced / unverified on this host**. It is **excluded from v0 acceptance criteria.**
- Do **not** fake llama `/slots` semantics onto vLLM. Different shape — PLAN §4 already conceded this.
- Real endpoints per upstream docs: `GET /health` (liveness; checks `engine_dead` only), `GET /metrics` (Prometheus, `vllm:` prefix). Useful gauges: `vllm:num_requests_running`, `vllm:num_requests_waiting`, `vllm:kv_cache_usage_perc` (**0–1 fraction, not percent**). Version-dependent: `/health/ready` (1-token GPU forward pass) is recent; treat its absence as normal.
- **Gotcha to document:** vLLM started with `--disable-log-stats` returns an **empty** `/metrics` (200, no series) — the adapter must read that as "no data", not "idle".
- Keep it behind the same adapter interface so a future vLLM-owning contributor can verify and promote it to tier 1 without restructuring.

**Also verified:** generic-OpenAI thin path (`/v1/models` + latency) is testable on llama-server itself (`/v1/models` → 200), so tier 2 behavior can be exercised without a second stack.

---

## 12. Success bar (honest)

**Ship bar:** operator never again confuses “server is legitimately busy on a long prefill on the only slot” with “DSH is broken,” without opening a terminal — and the pane shows **why** (busy, prompt progress, decode count, age), not just “running.”

**Non-goals:** reinvent trajectory time-travel; another settings skin; universal perfect metrics on every OpenAI clone.

---

## 13. Suggested next artifacts

| File | Role |
| --- | --- |
| `STATUS.md` | Resume interface |
| `SPEC.md` | Phased build + tests (when greenlit) |
| `NOTES.md` | Frozen seams with evidence (P0) |

---

## 14. Out of scope reminders

Sacred ports, pin version, `--patch` → `dsh.bundle`: same laws as gpu-monitor / task-status. See [`ENV.md`](ENV.md) and [`long-horizon-task-protocol.md`](long-horizon-task-protocol.md).
