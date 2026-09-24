/**
 * Host half of dsh-slot-health.
 *
 * Registers the /api/dsh-slot-health route on the harness webserver and runs
 * a 1 Hz sampler behind it, so the handler is a constant-time read of the
 * cached snapshot. Boot-safe by design: collector errors become runtime
 * states served by the route, never boot-time throws.
 *
 * P0 serves a hardcoded stub snapshot; the single `collectSnapshot()` seam in
 * ./collect.ts is where real endpoint adapters land in later phases.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { collectSnapshot } from './collect.ts'
import type { SlotHealthSnapshot } from '../shared/types.ts'

export const name = 'dsh-slot-health'
export const inject = ['webServer']

export { ROUTE } from './route.ts'
import { ROUTE } from './route.ts'
export type { SlotHealthSnapshot } from '../shared/types.ts'

/** Interval between samples (ms). The pane polls at ~1 Hz. */
export const SAMPLE_INTERVAL_MS = 1000

/** The most recent sample; refreshed in place by the sampler. */
let latest: SlotHealthSnapshot = collectSnapshot()
let timer: ReturnType<typeof setInterval> | undefined

/** One sampling pass; never throws. */
function tick(): void {
  try {
    latest = collectSnapshot()
  } catch (err: unknown) {
    latest = { ok: false, sampledAt: Date.now(), error: String(err) }
  }
}

export function apply(ctx: Context): void {
  const unregister = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain' })
        res.end('method not allowed')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(latest))
    },
  })
  // The effect body runs immediately and must RETURN the disposer.
  ctx.effect(() => {
    tick()
    timer = setInterval(tick, SAMPLE_INTERVAL_MS)
    timer.unref?.()
    return () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
  }, 'slot-health: sampler')
  ctx.effect(() => unregister, 'slot-health: /api/dsh-slot-health route')
}
