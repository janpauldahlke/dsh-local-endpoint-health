# dsh-slot-health

DSH plugin: live health of local LLM endpoints (llama.cpp, Ollama) shown as a
rightbar tab.

- **Host face** (`lib/index.js`): registers `GET /api/dsh-slot-health` on the
  harness webserver; a 1 Hz sampler keeps a cached snapshot there.
- **Client face** (`lib/client.js`): registers the **Slot Health** tab in the
  right sidebar via `@deepseek-ai/dsh-client-ui-sidebar-right`.

Built output ships in `lib/` so installation needs no toolchain.

## Develop

```
npm install
npm run build
dsh web --profile web
```
