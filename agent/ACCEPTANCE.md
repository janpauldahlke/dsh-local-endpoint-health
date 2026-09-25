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
