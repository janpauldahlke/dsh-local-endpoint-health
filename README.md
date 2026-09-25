# dsh-slot-health

DSH plugin: live health of local LLM endpoints (llama.cpp, Ollama) shown as a
rightbar tab.

- **Host face** (`lib/index.js`): registers `GET /api/dsh-slot-health` on the
  harness webserver; a 1 Hz sampler keeps a cached snapshot there.
- **Client face** (`lib/client.js`): registers the **Slot Health** tab in the
  right sidebar via `@deepseek-ai/dsh-client-ui-sidebar-right`.

Built output ships in `lib/` so installation needs no toolchain.

## Supported engines

The engine is fingerprinted by response shape (never guessed): llama =
`/health` `{"status":"ok"}` + `/slots` array; Ollama = `GET /api/version`;
vLLM = `vllm:` series in `/metrics`. The engine is shown on the dock chip
(`llama · busy`) and the pane top (`· ollama 0.22.1`).

- **llama.cpp** — full support: slots, busy/TTFT latches, wedged detection,
  `/metrics` engine. Zero extra probes (the `/health` shape is the oracle).
- **Ollama** (tier 2) — honest up-states, not busy-vocabulary: `up-no-model`
  (`/api/ps` → `{"models":[]}` — up, nothing loaded; not an error) and
  `up-loaded` (≥1 model resident; resident ≠ busy — keep-alive evicts after
  ~5 m). MODELS card: resident models + library count from `/api/tags`.
- **vLLM** (stub) — fingerprinted, no dedicated sections yet.

## Develop

```
npm install
npm run build
dsh web --profile web
```
