# `dsh-slot-health` — Acceptance record

Acceptance server: `http://127.0.0.1:3090/` (token-protected URL printed to boot log at `/tmp/dsh-3090.log`).
Never POST to `:8090`; never kill `:3080`/`:8080`/`:11434`.

## P0 — scaffold (verified 2026-09-24, agent-side)

| # | Check | Result |
|---|-------|--------|
| 1 | `node build.mjs` → `lib/index.js` (1315 B) + `lib/client.js` (3543 B) exist, non-empty | ✅ |
| 2 | `dsh --profile web --dump-config` shows row `id: slot-health` / `name: dsh-slot-health` | ✅ |
| 3 | Boot `dsh web --port 3090 --no-open` (clean env, no `--profile`, no `DSH_WEB_URL`) | ✅ |
| 4 | `curl http://127.0.0.1:3090/api/dsh-slot-health` → `{"ok":true,"sampledAt":…}` | ✅ |
| 5 | `lib/client.js` starts `window.__ModuleLoader__.load({ id: "dsh-slot-health", factory: …` — id === package name | ✅ |
| 6 | `package.json` has `dsh.bundle.patch` **and** `dsh.client` (`platform: "web"`, `inject: ["@deepseek-ai/dsh-client-ui-sidebar-right"]`) | ✅ |
| 7 | `cordis.patch.yml` row `name` === `package.json` `name` (`dsh-slot-health`) | ✅ |
| 8 | Client exports `inject` + `apply`; rightbar tab + `SlotBody`/`SlotTitle` registered at `apply` top level (not in a React effect) | ✅ |
| 9 | Client bundle reachable from server: page preloads it; combo URL `GET /plugins/??…&rev=…` → **200**, 3510-byte section with the full wrapper (registers `sidebarRightTabs`, slots `sidebar.right.pane.tab` / `.title`, clean `return module.exports; } });` tail) | ✅ |
| 10 | Boot log has no errors mentioning `dsh-slot-health` | ✅ |
| 11 | **pending-human:** browser opens the rightbar tab (`dsh-slot-health`) and renders the placeholder | ⏳ **first morning check** |

### Morning check (human)

1. Open the token URL from `/tmp/dsh-3090.log` (or re-boot on `:3090`).
2. Confirm the right sidebar shows a `dsh-slot-health` tab; clicking it renders the placeholder string.
3. If it fails: open devtools console for loader errors; the server-side wiring above is already proven, so the suspect is browser-side `inject`/registration only.

Notes:
- Single-file `GET /plugins/dsh-slot-health/client.js?rev=…` 404s by design — entries are served via the `??` combo URL only; chunks use the single-file form.
- HTML preload hrefs use `&amp;` entities; unescape before curling.

## P1 — vertical slice (verified 2026-09-25, agent-side)

| # | Check | Result |
|---|-------|--------|
| 1 | `node build.mjs` → `lib/index.js` + `lib/client.js` (8828 B local / 8881 B served) exist, non-empty | ✅ |
| 2 | `GET /api/dsh-slot-health` (live origin `:8080`) → `{"ok":true,"state":"idle","origin":"http://127.0.0.1:8080","latencyMs":1,…}` | ✅ |
| 3 | **AC1:** origin → dead port `:59999` via `cordis.patch.yml` `config.origin` → `{"ok":false,"state":"unreachable","lastError":"connection refused",…}` on **poll 1** (≤3), no error thrown by route | ✅ |
| 4 | **AC2 host-side:** `sampledAt` advances ~1 s/poll on live origin (…32608 → …33610 → …35611) — sampler loop alive | ✅ |
| 5 | State table (unit-verified in `collect.ts`): fetch-exception/timeout/≥500 → `unreachable`; 2xx/3xx + `status==="ok"` → `idle`; else → `unknown`; `latencyMs: null` when unreachable; `lastError` resets on good sample | ✅ |
| 6 | `collect.ts` never throws; 2 s timeout is a module constant, not config | ✅ |
| 7 | Served client bundle (`plugins/??dsh-slot-health/client.js&rev=10987e59041cc1f8-50`, 8881 B) contains all current markers: `waiting for first sample`, `sidebar.right.pane.tab`, `sampledAt\|lastAttempt` | ✅ |
| 8 | Origin restored to `:8080` in `cordis.patch.yml` after AC1; `DEFAULT_ORIGIN` fallback matches | ✅ |
| 9 | **pending-human:** browser — rightbar tab `dsh-slot-health` renders; live → **idle** + "updated N s ago" **advances** at 1 Hz (frozen age = dead poll loop); dead port → **unreachable** + last error + age; chat UI stays usable | ⏳ **first morning check** |

### Morning check (human)

1. Boot `dsh web --port 3090 --no-open` (or reuse the running one); open the token URL from `/tmp/dsh-3090.log` (token contains `-` — copy it whole, e.g. via `sed 's/.*token=\([A-Za-z0-9_-]*\).*/\1/p' /tmp/dsh-3090.log`).
2. Right sidebar → `dsh-slot-health` tab → pane should read **idle** with a green dot, latency, and an "updated N s ago" that **ticks up every second**.
3. (Optional, AC1) Stop nothing — instead edit `cordis.patch.yml` `config.origin` to a dead port, `node build.mjs`, restart `:3090`, reload: pane should read **unreachable** + `connection refused` within ~3 s, and the chat UI must stay usable.
4. If age freezes or the tab is missing: devtools console for loader errors; server side is proven above, so the suspect is browser-side `inject`/registration only.

Notes:
- Live origin default is `http://127.0.0.1:8080`; `cordis.patch.yml` `config.origin` **overrides** `DEFAULT_ORIGIN` — edit the patch file, not the code.
- Do not kill `:8080` to test unreachability; use the dead-port config path (the agent is served by that single slot).
