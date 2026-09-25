# Contributing

Thanks for poking at this. It is a small dual-face DeepSeek Harness plugin
(host sampler + web client pane). Keep changes focused.

## Setup

```sh
git clone https://github.com/janpauldahlke/dsh-slot-health.git
cd dsh-slot-health
npm install
node build.mjs
dsh plugin --profile web add "$PWD"
# restart dsh web; hard-refresh the browser
```

Point `cordis.patch.yml` `origin` at a live llama.cpp (`:8080`) or Ollama
(`:11434`) endpoint to see real metrics. Without one, the API still answers;
state will be `unreachable` / empty sections.

## Layout

| Path | Role |
| --- | --- |
| `src/host/` | Cordis plugin, 1 Hz sampler, `/api/dsh-slot-health` |
| `src/client/` | Rightbar tab + dock chip (inline styles only) |
| `src/shared/` | Snapshot types shared by both faces |
| `build.mjs` | esbuild → `lib/index.js` + `lib/client.js` |
| `cordis.patch.yml` | Loader row (`name` must match `package.json`) |

Client runtime may only `require` frozen DSH platform modules (react, cordis,
store, ui slots/primitives/dockkit). Everything else is bundled.

## Rules of the road

1. **Honesty over polish.** Fingerprint by response shape — never guess the
   engine. Ollama states are `up-loaded` / `up-no-model`, not llama `busy` /
   `idle`. Stale or missing fields stay missing.
2. **Sampler never throws.** Host collect paths catch and return partial /
   error-labeled snapshots. Boot must not die on a down origin.
3. **Rebuild after edits:** `node build.mjs`. Commit updated `lib/` when you
   change behavior so install-without-toolchain keeps working.
4. **No secrets** in screenshots, logs, or commits. Crop UI chrome; no
   `/home/<user>` session titles; never paste API keys.
5. **Sacred ports.** Do not kill/restart `:3080` (dsh), `:8080` (llama-server),
   or `:11434` (ollama) to “free” a port. Do not POST to `:8080` from the agent
   loop (deadlocks the slot you are monitoring).

## Verify locally

```sh
dsh --profile web --dump-config | grep dsh-slot-health
curl -s http://127.0.0.1:3080/api/dsh-slot-health   # adjust port
# llama: expect backend "llama-cpp", slots[], optional metrics
# ollama: expect backend "ollama", state up-loaded|up-no-model, ollama section
```

## Pull requests

- One concern per PR (host / client / docs / fingerprint).
- Say what you ran (llama.cpp busy/idle, Ollama loaded/empty, unreachable).
- Match existing style: small files, typed samples, inline client styles.
- Bump `package.json` `version` only when we intentionally cut a release.

## Out of scope (for now)

- Full vLLM sections (fingerprint stub only)
- Writing to the origin (load/unload/kill) — this plugin is read-only
- DeepSeek Harness core PRs — this stays an out-of-tree plugin

Questions or engine smoke reports: open a GitHub issue.
