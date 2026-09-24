/**
 * Browser half of dsh-slot-health: a rightbar tab with a health pane.
 *
 * Two-stage registration per the ui-sidebar-right contract:
 *   1. the tab type into ctx.sidebarRightTabs (identity, guide entry)
 *   2. its body (+ title) into the keyed sidebar.right.pane.tab seats
 *
 * Only the frozen platform baseline is imported at runtime; sidebar-right is
 * a type-only dependency (erased at build time).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SlotBody } from './SlotBody.tsx'
import { SlotTitle } from './SlotTitle.tsx'

const TAB_ID = 'dsh-slot-health'

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

export function apply(ctx: Context): void {
  const definition: SidebarRightTabDefinition = {
    id: TAB_ID,
    kind: 'slot-health',
    title: () => 'Slot Health',
    guide: [{
      id: 'slot-health',
      order: 300,
      title: () => 'Slot Health',
      description: () => 'Live health of local llama.cpp and Ollama endpoints',
    }],
  }
  // Register at apply's top level (never inside an effect scope): a registry
  // registration from an effect-internal scope stalls browser boot silently.
  const disposeType = ctx.sidebarRightTabs.register(definition)
  const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID },
    SlotBody,
  ))
  const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: TAB_ID },
    SlotTitle,
  ))
  // The effect body runs immediately and must RETURN the disposer; the
  // disposer runs at fiber unload.
  ctx.effect(() => () => {
    disposeTitle()
    disposeBody()
    disposeType()
  }, 'slot-health: rightbar tab type')
}
