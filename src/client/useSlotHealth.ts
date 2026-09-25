/**
 * Thin React binding over the shared live endpoint-health store.
 * (Blueprint: dsh-gpu-monitor-nvml's useGpu.ts — useState + useEffect, so
 * it works on any React version without useSyncExternalStore.)
 *
 * The store emits once per poll attempt (success or failure, ~1 Hz), so a
 * subscribed component re-renders every second and elapsed time advances.
 */
import { useEffect, useState } from 'react'
import type { HealthRouteResponse } from '../shared/types.ts'
import { getSnapshot, getPollError, getLastAttempt, subscribe } from './store.ts'

export interface SlotHealthLive {
  /** Latest route response (snapshot + origin), or null until the first successful poll. */
  snapshot: HealthRouteResponse | null
  /** Transport-level error: the plugin route itself failed (null when the last poll succeeded). */
  error: string | null
  /** Wall-clock of the most recent poll attempt, success or failure (epoch ms), or null. */
  lastAttempt: number | null
}

function readLive(): SlotHealthLive {
  return {
    snapshot: getSnapshot(),
    error: getPollError(),
    lastAttempt: getLastAttempt(),
  }
}

/** Subscribe the component to the refcounted 1 Hz poller; returns current state. */
export function useSlotHealth(): SlotHealthLive {
  const [live, setLive] = useState<SlotHealthLive>(readLive)
  useEffect(() => {
    return subscribe(() => setLive(readLive()))
  }, [])
  return live
}
