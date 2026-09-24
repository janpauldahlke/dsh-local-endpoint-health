import type { SlotHealthSnapshot } from '../shared/types.ts'

/**
 * The single seam between the route and the world: everything the plugin
 * serves comes from this one function. P0 returns a hardcoded stub; later
 * phases swap in real endpoint adapters (llama.cpp, Ollama) behind it
 * without touching the host wiring.
 */
export function collectSnapshot(): SlotHealthSnapshot {
  return { ok: true, sampledAt: Date.now() }
}
