/**
 * dsh-slot-health build: two artifacts, one package.
 *
 * - lib/index.js  — host half (ESM, node): Cordis plugin with the health
 *                   collector and the /api/dsh-slot-health route on the
 *                   harness webserver.
 * - lib/client.js — browser half (CJS closure factory): registered through
 *                   window.__ModuleLoader__ per the dsh-client-modules
 *                   contract (see packages/client/tsdown.client.ts in the
 *                   harness tree).
 *
 * The client bundle keeps every import on the frozen platform baseline
 * (PLATFORM_MODULES) so dsh.client.external stays empty; the sidebar-right
 * package is needed only for type-only imports, which the compiler erases.
 */
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = pkg.name

/** Frozen shell module-table baseline — the only runtime requests allowed. */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

await mkdir(join(root, 'lib'), { recursive: true })

// ---- host half ------------------------------------------------------------
await build({
  entryPoints: [join(root, 'src/host/index.ts')],
  outfile: join(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  // This plugin is pure HTTP: no native/runtime deps, so only the
  // @deepseek-ai/* host packages stay external (resolved from the profile).
  external: ['@deepseek-ai/*'],
  logLevel: 'warning',
})

// ---- latch (testable pure module) ------------------------------------------
// Rebuilt as a standalone entry so unit tests can import the busy-age/TTFT
// state machine without pulling in the host bundle's cordis externals.
await build({
  entryPoints: [join(root, 'src/host/latch.ts')],
  outfile: join(root, 'lib/latch.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- metrics (testable pure module) ----------------------------------------
// Rebuilt as a standalone entry so unit tests can drive the /metrics engine
// with fixture probes without pulling in the host bundle's cordis externals.
await build({
  entryPoints: [join(root, 'src/host/metrics.ts')],
  outfile: join(root, 'lib/metrics.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- fingerprint (testable pure module, P8) --------------------------------
// Rebuilt as a standalone entry so unit tests can drive the engine
// fingerprinting without pulling in the host bundle's cordis externals.
await build({
  entryPoints: [join(root, 'src/host/fingerprint.ts')],
  outfile: join(root, 'lib/fingerprint.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- ollama (testable pure module, P8) -------------------------------------
// Parsers for the Ollama reporting surface (/api/ps, /api/tags).
await build({
  entryPoints: [join(root, 'src/host/ollama.ts')],
  outfile: join(root, 'lib/ollama.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- slotState (testable pure module) --------------------------------------
// Rebuilt as a standalone entry so unit tests can import the chip state
// derivation without pulling in the client bundle's browser externals.
await build({
  entryPoints: [join(root, 'src/client/slotState.ts')],
  outfile: join(root, 'lib/slotState.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- metricsFmt (testable pure module) -------------------------------------
// Rebuilt as a standalone entry so unit tests can feed the metrics pane
// coercers old/new section shapes without pulling in browser externals.
await build({
  entryPoints: [join(root, 'src/client/metricsFmt.ts')],
  outfile: join(root, 'lib/metricsFmt.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: true,
  logLevel: 'warning',
})

// ---- client half ----------------------------------------------------------
await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  outfile: join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  external: [...PLATFORM_EXTERNALS, '@deepseek-ai/*'],
  // esbuild has no `intro`; the rolldown intro line folds into the banner so
  // the artifact layout matches the harness preset exactly.
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'warning',
})

console.log(`[dsh-slot-health] built lib/index.js + lib/client.js for ${id}`)
