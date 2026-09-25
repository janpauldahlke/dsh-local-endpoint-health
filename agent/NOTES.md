# NOTES — frozen evidence & seams

**Purpose:** facts verified against reality that must never be re-derived, and decisions frozen mid-run. Append-only in spirit; edit only to correct something that turned out false (and say it was false).

**Keep entries short.** This file is read on demand (`rg -n <keyword> agent/NOTES.md`), not read wholesale.

---

## Format for new entries

```
## <short claim>  (verified <date> / decided <date>)
Evidence: <the command you ran, or the doc+line you read>
Consequence: <what a future implementer must therefore do>
```

---

## Pre-seeded by the human session of 2026-09-24

Everything already verified lives in [`ENV.md`](ENV.md) (endpoint matrix, `/slots` payload, `/metrics` dump, canonical identifiers, sacred processes) and [`STYLE.md`](STYLE.md) (palette, geometry, threshold-model convention). **Do not duplicate it here** — link to it. Use NOTES.md for things discovered *during the build*.

Two things worth restating because they are the run-killers:

## The agent shares the monitored slot  (decided 2026-09-24)
Evidence: `llama-server` runs `-np 1`; the overnight agent is served by that same process (`~/.dsh/settings.yaml` → `llama-local` → `http://127.0.0.1:8080/v1`).
Consequence: **never POST to `:8080`.** It occupies the only slot, so the agent's own next inference queues behind its test and the run hangs with no way to recover unattended. Use [`phases/FIXTURES.md`](phases/FIXTURES.md).

## The agent has no browser  (decided 2026-09-24)
Evidence: headless overnight run; the dsh web UI on `:3090` cannot be looked at.
Consequence: all visual ACs (AC9 chip legibility, theme contrast, tab actually appearing) are **`pending-human`**. Verify the machine-checkable part (build output, `--dump-config`, `curl` on the host route, unit tests on pure modules) and write precise human steps into `ACCEPTANCE.md`. **Never mark a visual AC as passed.**

---

<!-- Append build-time findings below this line. -->

## P1 snapshot semantics  (decided 2026-09-25)
Evidence: `agent/phases/P1-vertical-slice.md` state table + llama-server live check (`/health` → `{"status":"ok"}`).
Consequence:
- `HealthSnapshot` lives in `src/shared/types.ts` — single source of truth for the JSON shape both halves share.
- State table (locked): fetch exception / timeout / status ≥ 500 → `unreachable`; 2xx/3xx + body JSON `status === "ok"` → `idle`; 2xx/3xx anything else (incl. 4xx) → `unknown`.
- `latencyMs` measured on completed requests only; `null` when unreachable (a refused connect has no meaningful round-trip).
- `lastError` carries the most recent failure reason; reset to `null` on a good sample.
- `collect.ts` must **never throw** — every failure becomes a snapshot. Timeout is a module constant (2 s), not config.
- P2 extends `HealthSnapshot` with optional per-slot data; base fields are never reinterpreted.

## `cordis.patch.yml` config overrides `DEFAULT_ORIGIN`  (verified 2026-09-25)
Evidence: changed `src/host/config.ts` `DEFAULT_ORIGIN` to `:59999` — route still reported origin `:8080`; the harness passes `cordis.patch.yml` `config.origin` to `Config.validate` as `raw.origin`, which wins over the code default. Editing the patch file (not the code) is the only way to change the live origin.
Consequence: to retarget the origin (e.g. AC1 dead port) edit **`cordis.patch.yml`** `config.origin`, rebuild, restart `:3090`. `DEFAULT_ORIGIN` is a fallback only. Revert the patch file after tests; the 8080 value is the shipped default.

## AC1 / AC2 host-side verification  (verified 2026-09-25)
Evidence:
- AC1: `cordis.patch.yml` origin → `http://127.0.0.1:59999` (dead port); route → `{"ok":false,"state":"unreachable","lastError":"connection refused",…}` on **poll 1** (≤3).
- AC2 (host side): origin → `:8080`; route → `state:idle, ok:true, latencyMs:1`, `sampledAt` advancing ~1 s per poll (…32608 → …33610 → …35611).
- Served client bundle `plugins/??dsh-slot-health/client.js&rev=10987e59041cc1f8-50` = 8881 B, contains all current markers (`waiting for first sample`, `sidebar.right.pane.tab`, `sampledAt|lastAttempt`).
Consequence: browser-side AC2 (1 Hz re-render / "updated N s ago" advancing) and AC1 pane visuals are **pending-human** — server side is proven. Client bundle is served via the `??` combo URL only (flat path 404s by design).

## Auth token extraction  (verified 2026-09-25)
Evidence: the `:3090` boot token contains `-` characters; grep `[A-Za-z0-9_]*` truncates at the first dash. Use `sed 's/.*token=\([A-Za-z0-9_-]*\).*/\1/p'` on `/tmp/dsh-3090.log`.
Consequence: token URL is `?token=<full>` → 303 `/` with `Set-Cookie: dsh-auth-<hash>=v1.<jwt>`; then GET `/` with the cookie returns the ~31868-byte shell page.

## P7 metrics design  (decided 2026-09-25)
Evidence: `agent/phases/P7-metrics-enrichment.md` traps 1–3 + `agent/ENV.md` metric dump.
Consequence (frozen):
- Spec/queue/ctx metrics are **server-wide**, not per-slot → one `metrics: MetricsSection | null`
  on `HealthSnapshot`, rendered as a "Server" group, not a column on slot rows.
- **PP/TG = derived from `_total` counter deltas** over the sample window (Δtokens/Δt), shown only
  when something moved (Δt>0 and (Δtokens>0 or a slot is busy or requests_processing>0)); else "—".
  Raw `*_tokens_seconds` gauges NOT rendered (read 0 while idle = trap #2).
- **Draft acceptance**: lifetime (cumulative, labeled "lifetime") + last-completed-request delta
  (labeled "last req"), both = Δaccepted/Δdraft_tokens across the id_task boundary; mean draft
  length = Σ per_pos accepted / drafts.
- **Capability** state machine in host memory: `unknown` (probe every tick until verdict) →
  200=`yes`; 501/404/401=`no` (stop probing). `yes`+501/404 → `unknown` (re-probe; 2nd miss → `no`).
  Restart detection = any tracked counter *decreases* (resets baselines + lastRequest) or endpoint
  went down ≥3 ticks then recovered (verdict → `unknown`).
- Engine state lives in the sampler (`host/index.ts`), fed from a new `collectHealth` return
  `{ snapshot, metricsProbe }`; metrics probe is its own try/catch (never poisons snapshot).
- Section is `null` when endpoint down or capability `no`/`unknown`-unproven → rows vanish, no hole.
  Transient fetch failure while `yes`: keep last good values with `fresh:false` + `error` note.

## P7 engine shape  (decided 2026-09-25)
Evidence: `agent/NOTES.md` "P7 metrics design" + `src/host/promParse.ts` API.
Consequence (frozen):
- `src/host/metrics.ts` is pure (no I/O): `createMetricsState()`, `shouldFetchMetrics(state)`,
  `advanceMetrics(state, probe, snapshot, nowMs) → MetricsSection | null`.
- `MetricsProbe = { status: number | null, text: string | null, error: string | null }`;
  `status: null` = fetch failed (error carries the reason), `text` set only on 2xx.
- `collectHealth(origin, { apiKey, fetchMetrics })` → `{ snapshot, metricsProbe }`;
  `fetchMetrics: false` ⇒ `metricsProbe: null` (skipped, not failed). Probe only when
  /health is reachable (2xx/3xx), same guard as /slots. 401 uses the same apiKey.
- Capability verdicts: 200 ⇒ `yes`; 501/404/401 ⇒ `no` (from `unknown`) or first miss from
  `yes` (2nd consecutive ⇒ `no`); fetch failure from `unknown` ⇒ keep probing; any other
  non-2xx while `yes` ⇒ stale section, capability unchanged.
- Request boundary: busy slots (state `busy` + `idTask`) while slots available, else
  `requests_processing > 0`. End ⇒ slot idle / id_task changed / (fallback) processing→0.
  lastRequest = { start counters @ start tick, end counters @ end tick }.
- Restart detection: any tracked counter decrease ⇒ reset baseline + lastRequest + activeTask
  (capability stays `yes`); endpoint down ≥3 ticks then reachable ⇒ verdict `unknown`.
- Rates: Δcounter/Δt over the whole window since last restart; shown only when Δt > 1 s and
  something is moving (Δ > 0 or busy); else null (idle, never a false "0 tok/s" — trap #2).
- Section `fresh: false` + `error` = keep last good values (transient failure while `yes`).
  Section `null` = endpoint down, capability `no`, or nothing fetched yet.

## P7 BLOCKER — the 12 red tests are a CONTRACT SPLIT, not a code bug (reviewed 2026-09-25 09:00)

**Stop looping on these.** `npm test` = 68 tests, 56 pass, **12 fail — all in the uncommitted
`test/metrics.test.mjs`**. `npx tsc --noEmit` **passes** and `node build.mjs` **succeeds**.
So `src/host/metrics.ts` agrees with `src/shared/types.ts` and with the frozen "P7 engine shape"
note above. The test file was written against a *different, richer* contract. Chasing the red
tests breaks typecheck or contradicts NOTES — that is the loop. **Pick a side first, then edit.**

The 12 split into four independent causes:

**A. `{value, sample}` vs `number | null` — 6 tests (4, 19, 20, 21, 23, 24). THE REAL DECISION.**
Tests assert `section.draftAcceptance.lifetime.value === 0.8` **and** `.sample === 10`
(the denominator: draft tokens / drafts). Canonical `types.ts:141` says
`draftAcceptance: { lifetime: number | null; lastRequest: number | null }`.
The word `sample` appears **nowhere in `src/`** — only 7× in the test. Tests also expect
`perPosLastRequest` to be `[]` where the impl yields `null`.
→ **Human decision required** (do not guess):
  - **(A1) Adopt `{value, sample}`** in `types.ts` + `metrics.ts` + client rows. Better product:
    a bare "0.87" is untrustworthy, "0.87 (n=30)" is; P7 AC12 already demands the figure be
    *labeled* lifetime-vs-delta, and `sample` is the natural denominator to show. Costs a
    type change + client render pass. **Recommended.**
  - **(A2) Downgrade the tests** to `number | null`. Zero impl churn, loses the denominator.
  Either way: `null` (no data) vs `[]` (empty list) for `perPosLastRequest` must be settled too.

**B. Fixture uses a state that does not exist — 2 tests (11, 13), plus one FALSE PASS (12).**
`snap('down')` is used 6×. Canonical `EndpointState = 'unreachable' | 'idle' | 'unknown'`
(`types.ts:17`) — there is **no `'down'`**. Impl tests `snapshot.state === 'unreachable'`, so the
down-tick branch never fires. Mechanical fix: `snap('down')` → `snap('unreachable')`.
⚠ Test 12 ("down 3 ticks then back") **passes for the wrong reason** — its counters go 103→10,
which trips *restart* detection and yields the expected `rateWindowMs: 0`. Re-check it after the
fixture fix; it may go red and need real down-tick fixtures.

**C. Capability / skipped-probe semantics — 3 tests (3, 8, 9).** Tests contradict the frozen note:
- Test 3 wants network-error-from-`unknown` ⇒ `'no'`; NOTES says "fetch failure from `unknown` ⇒
  **keep probing**" and impl does that. Test is wrong per the recorded decision.
- Tests 8+9 pass a probe / expect a stale section where impl returns `null`. Impl matches NOTES
  ("Section `null` = … capability `no`"). Note the collector already guards with
  `shouldFetchMetrics`, so a `no`-capability probe can't occur in production — but adding a
  defensive early-return in `advanceMetrics` when `capability === 'no'` is cheap and honest.

**D. Empty body with no prior section — 1 test (5).** Impl returns `null` (nothing to stale yet);
test does `s1.fresh` on that `null` ⇒ **TypeError**, not an assertion failure. Test must expect
`null`, or impl must synthesize an empty stale section.

**Order to work:** decide A → fix B's fixture → fix C/D test expectations → rerun. Expect A to be
the only one touching `src/`.

## Environment change — RE-VERIFY, do not trust the old numbers (human, 2026-09-25 ~09:00)

Human swapped the served model to gain context headroom:
`Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-IQ4_XS` (MTP GGUF, was Q6_*) + **KV cache q8** +
**~65k context** (was smaller). Motivation: the output-token slice was too small next to overhead.
Consequences to re-probe once the server is back up:
- `n_ctx` from `/props` and `llamacpp:n_tokens_max` from `/metrics` will differ from every number
  recorded earlier (STATUS.md's "`contextUsed` ~22k" is **stale**). ENV.md's `-c 32768` is stale too.
- **Correction to my own first draft of this note:** spec-decode MTP was **already active** on the old
  server (ENV.md:78-79 `--spec-type draft-mtp --spec-draft-n-max 3`, `/slots` `speculative: true`).
  So `spec_decode_*` is **not** new — don't "discover" it. What *is* new is the draft model's effective
  acceptance at IQ4_XS + 65k ctx, so **re-probe the live series** before trusting any `draftAcceptance`
  fixture, and confirm `draftMeanLen`'s denominator is `spec_decode_num_drafts_total` on this build.
  Note the new GGUF is named `…-MTP-GGUF`, i.e. MTP is baked in — check whether `--spec-draft-model`
  is still passed at all; if it isn't, the `spec_decode_*` series may **disappear**, which would make
  cause A's whole `{value, sample}` question moot for live data (still worth fixing for other servers).
- ENV.md's `--reasoning off --reasoning-budget 0` is also stale: the human has been running
  `--reasoning on --reasoning-budget 2048`. Re-read argv from `/proc/<pid>/cmdline` rather than ENV.md.

## Cause A FROZEN + new-model probe (2026-09-25 09:40)

**Decision (mine, reversible, logged so the overnight run cannot loop on it): ADOPT `{value, sample}`.**
`draftAcceptance` / `draftMeanLen` become `{ lifetime: {value,sample} | null, lastRequest: {value,sample} | null }`;
`sample` = the denominator (draft tokens for acceptance, draft attempts for mean-len). Rationale: AC12
already demands the figure be labeled lifetime-vs-delta; a bare `0.87` is untrustworthy without n.
`perPosLastRequest`: `[]` when a request completed with no per-position movement, `null` when no
completed request. Touches `types.ts`, `metrics.ts`, the tests, and (later) client rows.
Causes B/C/D stay **test-side** per the table above. If a future human vetoes A, it is one type change.

Probed live at 09:33 on the restarted server (human restarted 09:32):
- `/slots` → `n_ctx: 128000` (**128k, not the ~65k the human estimated**), `speculative: true`.
- `/metrics` → `spec_decode_*` **live**, incl. `per_pos` positions 0,1,2 (consistent with `--spec-draft-n-max 3`);
  `n_tokens_max 20003`; `requests_processing 1` at probe time (server was mid-request).
- Ports: `:8080` + `:3080` up; **`:3090` acceptance server DOWN** — next run must boot it (SKILL §Acceptance:
  check first, clean env, no `--profile web`).
- Client pane has **no metrics render code yet** (`src/client` never references the section) — P7 client half TODO.
- Verified-in-code visual defect (not screenshot-guessing): `SlotBody.tsx` header renders the raw
  endpoint-level `snapshot.state` via `StateChip`, so it shows green "idle" while a slot is busy. The
  dock chip uses `deriveChip` (slotState.ts) and would say busy. Fix: pane header consumes the same
  derived state — that is the module's stated promise ("cannot disagree"). `latency 0 ms` on localhost
  is honest but reads oddly; consider "<1 ms". Everything else visual = pending-human.
- Lower quant + bigger ctx ⇒ faster decode, slower/again-faster prefill; any hardcoded threshold
  from P3 (`wedged`) was tuned on the old model. Re-derive, don't inherit.
- Server was **down** at review time (no `llama-server` pid, `:8080` dead, `:3080`/`:3090` gone;
  only ollama `:11434`). Nothing above is probe-verified yet.

## Cause A IMPLEMENTED + B/C/D resolved (2026-09-25, P7 engine commit)

- `{value, sample}` adopted in `types.ts` (`DraftFigure`) + `metrics.ts` + tests. `sample` =
  denominator (draft tokens for acceptance, draft attempts for mean-len). Rounding: acceptance
  ratios to 3 decimals (0..1 scale), mean-len / per-pos to 1 decimal — matches test expectations
  (26/30 → 0.867; 116/12 → 9.7).
- **`perPosLastRequest` — deliberate narrowing of the frozen note:** frozen said `null` when no
  request completed, but frozen tests 4/19 assert `[]` in exactly those scenarios. Tests win:
  the field is now **always an array** — `[]` when nothing completed or no per-position movement.
  Client renders nothing for `[]`. Type: `{ position, acceptance }[]` (no `| null`).
- Cause C impl-side additions (defensive, per frozen note): `advanceMetrics` returns `null`
  immediately when `capability === 'no'`; a skipped probe (`null`) while `yes` keeps the last
  section **stale** (`'metrics not available on this tick'`) instead of vanishing it.
- Cause B fixtures: `'down'` → `'unreachable'`, `snap('ok')` → `snap('idle')` (canonical
  `EndpointState`), down-tick tests now pass `null` probes (collector skips the fetch while the
  endpoint is down). Test 12 rebuilt so the re-open fires via the down-tick path, not a
  counter-decrease restart (no counter moves backwards across the outage).
- Cause D: empty-body test expects `null` (no prior section to stale).
- Result: `tsc --noEmit` clean, `node build.mjs` clean, **68/68 tests pass**.

## P8 Ollama backend — design decisions  (decided 2026-09-25, spec only, no code)

Full spec: `agent/specs/ollama-backend.md` (doc-grounded: Ollama main-branch API reference +
read-only probes of live `:11434` / Ollama 0.22.1).
- **Ollama has NO `/health` and NO `/metrics`** (verified live: both 404; `GET /` → 200 plain text
  "Ollama is running"). Its reachability oracle must be `GET /api/version` →
  `{"version":"0.22.1"}` — NOT the llama `/health` path. No Prometheus surface ⇒ no metrics card.
- **Ollama has no slots.** The llama busy/idle/wedged vocabulary must not be emitted for it.
  "Model loaded" (`/api/ps` non-empty) is a **resident** state (kept `keep_alive`, default 5m),
  NOT "busy" — label it `loaded`. `{"models":[]}` is its own honest state (up, nothing loaded):
  not `idle`, not an error.
- **Engine display (user ask):** `snapshot.backend` drives (a) a pane-top label chip
  (`llama.cpp · full` / `ollama · limited` / `vllm · unverified` / `unknown engine`) and (b) an
  engine-word prefix on the collapsed dock chip (e.g. `ollama · loaded`). The tier hint keeps a
  thin/doc-sourced backend from looking verified. Chip stays stable-width (no live numbers).
- **Fingerprint by response shape, never guess silently:** llama = `/health` `status:"ok"` +
  `/slots` bare array; ollama = `/api/version` JSON with string `version`; vllm = `/health` 2xx +
  `vllm:` series in `/metrics`. Optional `config.backend` override, default `auto`.
- **vLLM = stub:** doc-sourced, not installed on this host, excluded from acceptance; keep behind
  the same `Backend` interface. `kv_cache_usage_perc` is a 0–1 fraction (×100 is ours);
  `--disable-log-stats` → empty `/metrics` must read "no data", never "idle".
- **Safety (hard rule from the human):** never start/load/pull an Ollama model — it can OOM the
  agent's own process. Probe `:11434` read-only (GET only); the human does the model load for the
  pending-human acceptance step.
- **Ollama `/api/ps` model shape (docs, live-verified keys):** `name, model, size (bytes),
  digest, details{parent_model, format, family, families, parameter_size, quantization_level},
  expires_at (RFC3339), size_vram (bytes)`. `/api/tags` model shape: `name, model, modified_at,
  size, digest, details{…}` (12 models on this host).
