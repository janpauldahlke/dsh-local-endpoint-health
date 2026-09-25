# `dsh-slot-health` — Acceptance record

Acceptance server: `http://127.0.0.1:3090/` (token URL printed to boot log `/tmp/dsh-3090.log`, line 1 — copy it whole).
Never POST to `:8080`; never kill `:3080`/`:8080`/`:11434`.

## P0 — scaffold (agent-verified 2026-09-24, `090a524`)
All machine checks passed: build artifacts non-empty; `dsh --profile web --dump-config` shows `id: slot-health` + `name: dsh-slot-health`;
clean boot on `:3090` (no profile, no `DSH_WEB_URL`); `GET /api/dsh-slot-health` → 200 `{"ok":true,…}`; combo bundle (200) contains the
full wrapper + registrations; `package.json` has `dsh.bundle.patch` + `dsh.client`; no loader errors in boot log.
- ⏳ pending-human: rightbar tab opens and renders (carried into the P6 morning check below).

## P1 — vertical slice (agent-verified 2026-09-25, `2069b8a`)
All machine checks passed: API decodes live `:8080` → `state:"idle"`, `latencyMs:1`; AC1 dead-port config → `unreachable` +
`connection refused` on poll 1; `sampledAt` advances ~1 s/poll; state table unit-verified; 2 s timeout is a constant;
`collect.ts` never throws; origin restored after AC1; bundle markers present.
- ⏳ pending-human: pane shows idle + advancing age; dead-port config → unreachable + error.

## P2–P5 — slot body, latch, errors, auth (agent-verified 2026-09-25, `9b0f9ac`)
- P2: `SlotSample[]` on snapshot (latch fields null-when-n/a); host stamps `busySinceMs`/`busyAgeMs`/`ttftMs` (`/slots` has no
  timestamps); per-slot rows + meter. **LIVE-verified on `:8080`:** idle→busy→idle, `busyAgeMs` advances, `ttftMs` latches on first decode.
- P3 wedged / P4 two failure layers (transport vs endpoint; `slots===null` → `slotsError`, the "key?" state) / P5 env-key precedence +
  10 s rotation retry: code present, AC runs partial. `npm test` 36/36 (`slotState` 25 + `latch` 13).
- ⏳ pending-human: busy/wedged/error labels + age latch read correctly in the pane.

## P6 — dock chip (agent-verified 2026-09-25, `e93a772`) — **AC10 done · AC9 pending-human**
Machine-verified (dsh CLI now `0.1.6-alpha.2` — `--profile`/`--dump-config` are global flags; plugin loads fine under it):
- Served `:3090` bundle (5 MB combo, 200) contains `{ name: "conversation.composer.dock", id: "slot-health", order: -10 }` + chip code
  (`deriveChip`/`ageLabel` + all P3–P5 label strings); gpu-monitor coexists (`id: "gpu-monitor"`, also `order: -10` — distinct ids, no collision).
- `dsh --profile web --dump-config` → `# == dsh-slot-health` row w/ `config.origin`; `dsh plugin --profile web list` shows both links.
- State→label map shared by chip + pane via `lib/slotState.mjs` (single `deriveChip`) — 25/25 unit tests; total 36/36.
- API with key set: `{"ok":true,"state":"idle","slotsError":null,"latencyMs":1,"origin":"http://127.0.0.1:8080"}` (real slots returned).

### Morning check (human) — AC9 + P0/P1/P2 carry-over
1. Open the token URL from `/tmp/dsh-3090.log` (server pid 282715). Restart if needed: `node <dsh-checkout>/apps/cli/lib/bin.js web --port 3090 --no-open`
   (with `LLAMA_API_KEY` in env — take it from pid 24993's environ, never print it).
2. Close the rightbar pane completely: a **single chip** in the composer dock shows state by word/glyph (not color alone — colorblind check).
3. Send a real message: chip idle→busy→idle in sync with the pane; no jitter while typing; composer doesn't wrap or shift.
4. Light + dark themes: chip readable in both.
5. Rightbar tab `dsh-slot-health`: idle + "updated N s ago" ticks every second; per-slot rows render; gpu-monitor chip still works alongside.
6. Failure states (optional — edit `cordis.patch.yml` `config.origin` or env key, `node build.mjs`, restart `:3090`, reload):
   dead port → **unreachable** + age; bad `LLAMA_API_KEY` → **auth required**; silent >3 s → **stale** (dimmed). Chat UI usable throughout.

## P7 — metrics engine + pane rows (agent-verified 2026-09-25, `8216613` engine / client commit)
Machine-verified: 68/68 tests; `tsc` + build clean. Served `:3090` bundle (23 KB combo, 200, fresh rev) contains the
new client code (`server metrics`, `acc·lifetime`, `deriveChip`); live route returns the new engine shape with real
spec data, e.g. `draftAcceptance.lifetime: { value: 0.649, sample: 26394 }`, `draftMeanLen.lifetime: { value: 1.9,
sample: 8798 }`, `perPosLastRequest: []` (always an array). Pane-header chip now consumes `deriveChip` (same as the
dock chip) instead of raw endpoint-level `snapshot.state`.
- ⏳ pending-human (open the token URL from `/tmp/dsh-3090.log`, line 1):
  1. Pane shows a **server metrics** section below the slot rows: `prompt /s`, `decode /s`, `deferred`, `active`,
     `ctx peak` rows appear only while non-null (idle server ⇒ fewer rows, no "0" rows, no layout hole).
  2. Spec rows are **labeled lifetime vs last req** and show their denominator, e.g. `acc · lifetime 0.649 (n=26394)`;
     after a completed request `acc · last req` / `len · last req` / `per-pos · last` (e.g. `p0 9 · p1 4`) appear.
  3. **Header chip = dock chip**: while a request runs, the pane header says `busy …` (blue) exactly like the dock
     chip — not green "idle" (the pre-fix defect).
  4. AC6: the section reads as *server* counters (window-labeled rates, queue, ctx peak, spec diagnostics), not a
     clone of the gpu-monitor tok/s pane; both panes can be open at once.
  5. Stale metrics (transient fetch failure while `yes`) keep last values dimmed with the error line.
- Note: server restarts (model swap) reset the counters — `lifetime` figures restart from small samples; that is
  correct behavior, not a bug.

## REVIEW §1+§2 — hardening + UI pass (agent-verified 2026-09-25, `7e9bc1e` / `021f2cb`)

Machine-verified:
- 76/76 tests (8 new `metricsFmt` smoke tests feed the exact pre-P7 section shape — `perPosLastRequest: null`,
  bare-number draft figures, garbage — and assert: no throw, rows degrade, bare numbers render without a
  denominator, `{value, sample}` renders `(n=…)`).
- Served `:3090` combo re-fetched (28,341 B, HTTP 200, fresh rev — server rebooted after the env restart,
  pid 454046, token at `/tmp/dsh-3090.log` line 1) and grepped: ECG path `M3 15 h5 l3 -7 l4 14 l3 -7 h7`,
  `icon: SlotHealthGuideIcon`, `color-mix(in srgb, currentColor 22%/55%, transparent)`, `tabular-nums` ×4,
  stable `label: "busy"` + `detail` template, `toPerPos` coercers — all present; hardcoded greys
  (`#c3c9d6`, `rgba(139,147,167,…)`) gone from the client bundle.
- Live `:3090` route returns the P7 shape end-to-end: `draftAcceptance.lifetime {value 0.647, sample 76990}`,
  `perPosLastRequest []`, `promptTokensPerSec 267`, `ctxHighWater 102581`; slot 0 live-busy (real in-flight
  request — `busyAgeMs` 79931, `ttftMs` 43919).
- `:3080` (human-restarted, pid 440235) — human confirmed the pane renders there too; the old-host crash is
  gone on both servers (new client hardens AND new host serves the P7 shape).

- ⏳ pending-human (token URL, `/tmp/dsh-3090.log` line 1; same on `:3080`):
  1. Pane rows are three-column (label | meter | right-aligned value): while a request runs, the number widths
     change every second and **the meters do not shift**; values are tabular figures.
  2. Busy: the dock chip word stays a stable `busy` (chip width does not grow with the age), while the pane
     header shows the rich `busy 1 m 20 s · dec N` in blue — chip and header agree.
  3. Guide list: the Slot Health capsule shows an **ECG pulse line**, not the default cube the GPU Monitor
     capsule uses — the two capsules are visually distinct now.
  4. Light + dark themes: slot rows, meters, and the metrics section stay readable (all ink is currentColor-mix;
     no hard grey); stale sample still dims the whole body.
  5. Tooltips: every row explains the metric and its source (`/slots` vs `/metrics`, counter-delta window).

## REVIEW2 — card chrome + collapsible sections (agent-verified 2026-09-25, `4812a74`)

Machine-verified:
- 83/83 tests (7 new `slotTone` cases incl. the P3 guard: healthy long prefill at 400 s stays `na`,
  prompt-done + zero-decoded at 400 s → `crit`, decoding at 400 s stays `na`; `WEDGED_AFTER_MS` = 300 000).
- Served `:3090` combo re-fetched (38,038 B, HTTP 200, fresh rev) and grepped: `CollapsibleCard`,
  all three localStorage keys (`dsh.slotHealth.card.slot.${id}` / `.metrics` / `.slots`), chevron
  (served `\u25B8`-escaped), `aria-expanded`, hover wash `currentColor 6%`, card border 18%,
  crit border `#f87171 60%`, `SLOT `/`SERVER` chips, `slotTone`, meter `{ratio, tooltip}` objects,
  caption, plus all REVIEW §2 markers still present (ECG icon, stable `label: "busy"`).
- Live `:3090` route healthy after the pass: slot 0 live-busy (agent's own request — card expands
  per policy), metrics fresh, `acc · lifetime {value 0.649, sample 106072}`.

- ⏳ pending-human (token URL, `/tmp/dsh-3090.log` line 1; same on `:3080`):
  1. Pane is now **cards**: flat header (state + origin + latency/updated), then a `SLOT 0` card and a
     `SERVER` card — radius-8 shells, hairline borders (theme-ink, no grey), hover wash on the header
     row, chevron ▸ rotates when opened.
  2. **Collapsed previews** (right-aligned, tabular): slot card idle → `ctx N% · dec 0 · busy —`;
     while a request runs → `busy 22s · dec 892 · prompt 5%` (each fragment has its own tooltip).
     SERVER card → `P/D tok/s · acc N%` + window label; collapsed by default.
  3. **Expand policy**: slot card opens while busy/wedged and closes when idle (until you toggle it);
     an explicit toggle **persists** across reloads (localStorage).
  4. **Keyboard**: header is focusable; Enter/Space toggles; `aria-expanded` flips.
  5. Light + dark themes: card borders/chevron/chips stay readable (all color-mix); stale sample or
     not-fresh metrics dims the card, not the theme.
  6. No regression: dock chip unchanged (stable word, hides while pane open); ECG guide icon unchanged;
     row tooltips still present inside the cards.
  7. **Dock pills align** (chip-chrome follow-up, same commit batch): the Slot Health dock chip now has the
     GPU Monitor chip's exact chrome — same height (no `lineHeight: 1`), `fontWeight 600` + `0.03em` tracking,
     `currentColor 22%` border, `currentColor 6%` background wash, glowing dot while fresh. Next to the GPU
     pill in the dock below the composer, the two should read as the same size and shape (both themes).

## P8 — Ollama backend + engine display (agent-verified 2026-09-25, `0b5fb60`)
Machine-verified (hard rule honored: **no model start/load/pull on `:11434`** — read-only GETs only):
- 115/115 tests (new `fingerprint` + `ollama` parser suites + P8 chip/`backendLabel` cases); tsc + build clean.
- Live collector smoke: `:11434` → `state:"up-no-model"`, `backend:"ollama"`, `backendVersion:"0.22.1"`,
  `ollama:{fresh:true, loaded:[], libraryCount:12}`, `lastError:null` (the 404 `/health` is no longer
  reported as a fault); `deriveChip` → `label:"ollama · no model"`, green dot; pane engine tag `ollama 0.22.1`.
- `:8080` (llama) unchanged: `state:"idle"`, `backend:"llama-cpp"` — llama pays zero extra probes.
- Served `:3090` client bundle (44,597 B, HTTP 200) contains all P8 markers: `up-no-model`/`up-loaded`,
  `no model`, `dsh.slotHealth.card.ollama`, `backendVersion`, `in library`, `llama.cpp`, `MODELS`.
- `:3090` reconnected (env had changed: llama-server now pid **525954**, dsh `:3080` pid **526121**;
  server pid **528259**, real `LLAMA_API_KEY` re-injected from llama-server environ, never printed):
  route → `state:"idle"`, `backend:"llama-cpp"`, real slots, `slotsError:null`.

- **Header reorder (P8 follow-up)**: the pane header is now stable-first —
  `· llama.cpp  127.0.0.1:8080  ● busy 15s · dec 1` — so the per-second
  age/dec ticks only extend the line's right edge and never shift the fixed
  engine/origin parts. `bareStateWord` strips the engine prefix from the state
  text (3 new unit tests, 118/118). Served bundle re-verified (rev changed).

- ⏳ pending-human (token URL, `/tmp/dsh-3090.log` line 1):
  1. **Ollama pane**: set origin in `~/.dsh/profiles/web/cordis.patch.yml` to `http://127.0.0.1:11434` and
     restart `:3090` → dock chip `ollama · no model` (green), pane header
     `· ollama 0.22.1  127.0.0.1:11434  ● no model` (stable parts on the left),
     MODELS card accent `no model` + meta `12 in library` + "Nothing loaded" hint. Never an error state.
  2. **Loaded model** (human loads on `:11434` — OOM hard rule): chip `ollama · loaded`, detail
     `loaded · <name>`, MODELS card rows (name · family/size/quant + size / vram / keeps N m).
  3. **Llama unchanged**: dock chip `llama · idle` / `llama · busy` (engine prefix), slot rows and
     SERVER card as before (no regression).
