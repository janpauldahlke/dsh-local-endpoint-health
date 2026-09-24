---
name: dsh-out-of-tree-plugin
description: >-
  Build, install, verify, and package out-of-tree DeepSeek Harness (dsh) web
  plugins (Host + Client dual-face, dsh.bundle). Use when creating or debugging
  a plugin package, connecting a bundle to a profile, choosing --patch vs
  installable bundle, opening an acceptance port, or preparing dsh.pub publish.
---

# Out-of-tree DSH web plugin

Distilled from the overnight **gpu-monitor** run (`overnite`) and the earlier
**dsh-agent-pet** experiment. Prefer this skill over re-grepping the harness
tree for “how do I load a plugin?” every session.

Pin APIs to the **installed** `dsh` version / `ENV.md`. Do not invent seats.

## Hard rules (do not violate)

1. **Sacred processes** — Never kill/restart the operator’s primary `dsh web`,
   llama / local inference, or ollama unless the human explicitly says so in a
   new message. Read `ENV.md` when present.
2. **Acceptance = second port** — Self-test with
   `dsh web --profile web --port <free> --no-open` (often `3090`). Do not bounce
   the human’s primary session (often `:3080`) to “see if it works.”
3. **Default path = installable bundle**, not `--patch`.
4. **Rebuild before boot** — `lib/index.js` and `lib/client.js` must exist.
   Missing client is a silent-or-loud activation failure; always `pnpm build` /
   `node build.mjs` after client edits.
5. **Package `name` ≡ patch row `name`** — and that name must resolve from the
   **profile** `node_modules` (`~/.dsh/profiles/web/`), not only from the
   harness checkout.
6. **Do not modify** `@deepseek-ai/dsh-client-*` / in-tree client packages to
   make an out-of-tree plugin work. Consume them; relocate only as last resort.

## Bundle vs `--patch` (read once, stop thrashing)

| Path | When | What |
| --- | --- | --- |
| **`dsh.bundle` + `dsh plugin add`** | **Default for real work / publish** | Package declares `dsh.bundle.patch`; CLI adds dep + appends to `dsh.profile.bundles`. Survives restarts. |
| **`--patch file.yml`** | First smoke / pet-style throwaway only | Host-only insert overlay for one boot. Does **not** replace needing `dsh.client` + resolvable package name. |
| Client-only `dsh.client` without `dsh.bundle` | **Broken for “installable”** | Installs as a plain dep and **does not activate** until a bundle/patch inserts a row. |

**Pet lesson** ([dsh-agent-pet](https://github.com/janpauldahlke/deepseek-experiement-series-with-smol-models/tree/main/dsh-agent-pet)):
`--patch` + link into profile `node_modules` proved the client graph, but it is
the **tutorial / smoke** path. **GPU-monitor lesson:** ship `dsh.bundle` from
day one so `dsh plugin --profile web add <path>` is the real loop.

Layer order reminder: bundle patches → profile `cordis.patch.yml` → home
`cordis.patch.yml` → `--patch` overlays.

## Minimal dual-face package

Directory = npm package root (also the future public GitHub root).

```json
{
  "name": "my-unique-plugin-name",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-sidebar-right"]
    }
  }
}
```

`cordis.patch.yml` (top-level YAML **array**):

```yaml
- insert:
    - id: my-plugin
      name: my-unique-plugin-name
```

- **Host** = package root export (`apply` / class + `inject`).
- **Client** = `./client` export, discovered from `dsh.client` — **not** listed
  as a second YAML row. Missing `dsh.client` → client never enters
  `__DSH_BOOT__` (often silent).

Pick a **unique** `name` before publish (`dsh-gpu-monitor` is crowded; prefer
`dsh-gpu-monitor-nvml` or `@you/...`). `id:` only needs uniqueness inside the
profile composition.

## Install / connect the bundle (stop re-discovering)

Preferred (when tools exist in-session):

- `plugin_manager` → `install_bundle` with absolute package directory.
- Or shell: `dsh plugin --profile web add /abs/path/to/package`
  (requires `dsh.bundle`; builds `lib/` first).

If resolution fails (“cannot find package”):

```sh
# profile must see the bare name
ln -sfn /abs/path/to/package "$HOME/.dsh/profiles/web/node_modules/my-unique-plugin-name"
```

Do **not**: relative `./lib/index.js` as the row name, or link only into the
harness repo’s `node_modules` (scan baseUrl is the **profile**).

After install: restart **acceptance** `dsh web` on the second port (or rely on
documented HMR). Hard-refresh the browser for client changes.

Verify composition: `dsh --profile web --dump-config` | search your `id` /
package name. API routes: `curl -s http://127.0.0.1:<port>/api/...`.

## Acceptance port (stop re-discovering)

```sh
# ensure port free, then:
dsh web --profile web --port 3090 --no-open
# logs → /tmp or nohup; open the printed token URL in a browser
```

- Primary operator UI stays up (often `:3080`).
- Inference stays up (often llama `:8080`, ollama `:11434`) — see `ENV.md`.
- If acceptance seems to require killing primary/llama: **stop**, write blocker
  in `STATUS.md`, continue other slices.

## Client contract (browser)

- Emit **CJS** `lib/client.js` wrapped for
  `window.__ModuleLoader__.load({ id: "<package name>", factory })`.
- Runtime `require` only **platform baseline** modules (react, cordis,
  `dsh-client-store`, slots/primitives/dockkit, …). Inline everything else
  (esbuild/tsdown). Type-only imports are fine.
- Shape: `export const inject = ['slots', …]; export function apply(ctx) {…}`.
- Register UI with `ctx.effect` cleanup. Prefer **inline styles** out-of-tree
  (no CSS pipeline unless you know the injection pattern).
- Register at `apply` top level — not only inside a React effect — or boot can
  stall silently (gpu-monitor rightbar lesson).

### Common seats (inspect live before inventing)

| Need | Prefer |
| --- | --- |
| Collapsible side pane | Rightbar tab: `sidebarRightTabs.register` + keyed `sidebar.right.pane.tab` |
| Floating chrome | `shell.overlay` (pointer-events careful) |
| Fallback | `conversation.view` / header corner |

Use `cordis_inspect_*` / slot list for the **pinned** dsh version. Fallback if
the preferred seat fights you — don’t rewrite the harness.

## Host↔UI data

Default simple pattern (gpu-monitor): Host registers
`ctx.webServer` route → Client `fetch` polls. Keep Host `apply` from throwing
(degrade to error JSON). Unload must dispose route + timers.

## Build loop

1. Edit sources under `src/`.
2. `node build.mjs` / `pnpm build` → refresh `lib/`.
3. Exercise on acceptance port; `curl` Host routes; glance UI.
4. Local `git commit` after a verified slice. **Never `git push`** unless the
   human asks. Never force-push.

## Client HMR (acceptance instance)
- Edit client source → rebuild (`node build.mjs`) → `lib/client.js` bytes change →
  running `dsh web` HMR reloads that plugin (stat/rev of bundle bytes).
- `pnpm run dev:web` is only needed if you want a *source watcher* to rebuild for you.
  If you rebuild yourself, you do not need it.
- Do not dig Loader/HMR source to “prove” reload. Verify: rebuild, glance :3090
  (hard-refresh if stale), continue product work.

## Publish later (human gate)

Agent may **prepare** the tree; human **publishes**:

1. Public GitHub repo with package at **repository root**.
2. Unique name, LICENSE, README with install command.
3. No secrets, no `ENV.md` / overnight STATUS dumps.
4. Human submits URL at https://dsh.pub/en/submit/ — **no PR into
   deepseek-harness core**.
5. npm optional; dsh.pub + GitHub is enough for discoverability.

## Anti-thrash checklist (when stuck >15 min)

- [ ] Does `package.json` have **both** `dsh.bundle` and `dsh.client`?
- [ ] Does `cordis.patch.yml` `name` match `package.json` `name`?
- [ ] Does `lib/client.js` exist and match the ModuleLoader wrapper?
- [ ] Is the package resolvable from `~/.dsh/profiles/<profile>/node_modules`?
- [ ] Are you testing on a **second port**, not killing primary/llama?
- [ ] Did you rebuild after the last client edit?
- [ ] Are you re-reading harness Loader source instead of this skill? Stop; fix
      the checklist item above.
