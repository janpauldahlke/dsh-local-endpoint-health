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
