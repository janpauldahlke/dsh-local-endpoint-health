# P0 — Scaffold the dual-face package

**Goal:** a package that *activates* on `:3090` with an empty pane. No product logic yet. Activation is the thing that silently fails, so it gets its own phase.

**Read:** this file, plus `SKILL.md` sections **"Minimal dual-face package"**, **"Install / connect the bundle"**, and **"Anti-thrash checklist"**. Skip the rest.

**Do not read:** `PLAN.md`.

---

## Inputs

Blueprint: `/home/hagbard/dev/dsh-gpu-monitor-nvml/` — a *shipped, working* dual-face package. Its real shape (verified):

```
src/host/{index.ts, route.ts, collect.ts, collect-smi.ts}
src/client/{index.tsx, GpuBody.tsx, GpuTitle.tsx, GpuDockChip.tsx, store.ts, paneState.ts, useGpu.ts, aggregate.ts}
src/shared/types.ts
build.mjs   cordis.patch.yml   package.json   tsconfig.json
```

`build.mjs` has two esbuild configs: host → `lib/index.js` (`format: esm`, `platform: node`, `external: ['node-nvml','@deepseek-ai/*']`), client → `lib/client.js` (`format: cjs`, `platform: browser`, `external: [...PLATFORM_EXTERNALS,'@deepseek-ai/*']`).

## What to build

Create at **repo root** (`/home/hagbard/dev/dsh-local-endpoint-health/`), not in a subdirectory:

- `package.json` — name `dsh-slot-health`; same `exports` triple as the blueprint; same `dsh.bundle` + `dsh.client` block with `inject: ["@deepseek-ai/dsh-client-ui-sidebar-right"]`. **No runtime dependencies** — this plugin is pure HTTP; drop `node-nvml` entirely.
- `cordis.patch.yml` — one Loader row, `name: dsh-slot-health` (must equal package name).
- `build.mjs`, `tsconfig.json` — copy and adapt; remove NVML externals.
- `src/shared/types.ts`, `src/host/index.ts`, `src/host/route.ts`, `src/client/index.tsx` — **minimal stubs**. Host registers the route and returns a hardcoded snapshot. Client registers the rightbar tab and renders a placeholder string.
- `.gitignore` — already exists and is correct (`node_modules/`, lockfiles, scratch). **`agent/` and `skills/` are deliberately tracked** — do not add them to `.gitignore`. **`lib/` is deliberately tracked** (built output, so install needs no toolchain) — do not ignore it either.
- `lib/` gets committed (blueprint does this so install needs no toolchain) — decide and note it in STATUS.

## Your call (deliberately unspecified)

- Exact placeholder text, file naming inside `src/`, whether to keep the blueprint's `store.ts`/`paneState.ts` split or flatten it for now.
- Whether to `npm install` a fresh `node_modules` or reuse the blueprint's esbuild. Note: `node_modules` here has only `esbuild`, `@esbuild`, `@types`, `csstype`, `node-nvml` — you need esbuild + types only.

**Design for later phases:** keep the collector behind a small interface (one function returning a snapshot) so P2/P8 can swap adapters without restructuring the host. Don't build that abstraction speculatively beyond a single seam.

## Verify (this phase is done only when all pass)

1. `node build.mjs` → both `lib/index.js` and `lib/client.js` exist, non-empty.
2. `dsh --profile web --dump-config | rg -i slot-health` → the row is present.
3. Boot acceptance: confirm `:3090` free, then `dsh web --profile web --port 3090 --no-open`.
4. `curl -s http://127.0.0.1:3090/api/dsh-slot-health` → your stub JSON. **This proves the host half works.**
5. **`pending-human`:** opening the browser to confirm the rightbar tab renders. **You have no browser** — this step is the only true proof of client activation, and you cannot perform it. Record it in `ACCEPTANCE.md` as the *first* morning check.

**Since you can't see the browser, do the strongest static checks instead — every one of these catches a real failure mode:**

- `lib/client.js` starts with `window.__ModuleLoader__.load({ id: "dsh-slot-health", factory: … })` and the `id` **exactly** equals the package name.
- `package.json` has **both** `dsh.bundle.patch` **and** `dsh.client` (`platform: "web"`, `inject: ["@deepseek-ai/dsh-client-ui-sidebar-right"]`). Missing `dsh.client` → client never enters `__DSH_BOOT__`, silently.
- `cordis.patch.yml` row `name` === `package.json` `name`.
- Client exports the right shape: `export const inject = […]` and `export function apply(ctx)`, with UI registered at `apply` **top level**, not only inside a React effect.
- Client bundle is reachable from the server: find the URL dsh serves the plugin client at (check the boot log / `--dump-config`) and `curl` it — a 200 with your bytes proves server-side wiring, if not browser execution.
- Check the acceptance boot log for errors mentioning your package name.

**Why this is acceptable risk:** the plugin contract itself is *not* an unknown — the gpu-monitor blueprint shipped and works, so you are copying a known-good shape, not discovering one. The residual risk is a typo in one of the identifiers above, which the static checks are designed to catch.

**If you cannot confirm client activation:** do **not** stall and do not thrash. Run the SKILL anti-thrash checklist once, write the result to STATUS.md as `pending-human: client activation unverified`, and **continue on the host side** (P1–P2 collector, route, adapters, fixtures), which you *can* fully verify with `curl`. Host-side progress is not wasted if the client needs a morning fix.

## Then

- `git add -A && git commit` (never push). Confirm `git status` shows no `agent/` files staged.
- Update `STATUS.md`: phase done, next 3 steps, any surprise.

## Likely traps

- **Missing `dsh.client` block** → client never enters `__DSH_BOOT__`, usually silently. Check it first.
- Registering the UI only inside a React effect → boot can stall. Register at `apply` top level (blueprint's rightbar lesson).
- `id:` in the patch row differing from package `name` → non-activation.
- Forgetting to rebuild after a client edit → you're looking at stale bytes.
