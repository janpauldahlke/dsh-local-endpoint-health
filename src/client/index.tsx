/**
 * Browser half of dsh-slot-health: a rightbar tab with a health pane.
 *
 * Two-stage registration per the ui-sidebar-right contract:
 *   1. the tab type into ctx.sidebarRightTabs (identity, guide entry)
 *   2. its body (+ title) into the keyed sidebar.right.pane.tab seats
 *
 * Only the frozen platform baseline is imported at runtime; the renderer,
 * sidebar-right, and chat client packages are type-only dependencies
 * (erased at build time).
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only import: activates the `Context.slots` declaration merge from the
// renderer client package (erased at build time).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only import: activates the `conversation.composer.dock` SlotMap
// declaration merge from the chat client package (erased at build time).
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { SlotBody } from './SlotBody.tsx'
import { SlotTitle } from './SlotTitle.tsx'
import { SlotDockChip } from './SlotDockChip.tsx'
import { SlotHealthGuideIcon } from './SlotHealthIcon.tsx'

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
      // REVIEW §2d: without an icon the guide draws its default cube — the
      // same placeholder GPU Monitor uses, so the capsules collided. The ECG
      // pulse reads as "health".
      icon: SlotHealthGuideIcon,
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
  // P6: dock chip — compact health indicator in the composer dock.
  // Hides itself while the rightbar pane is open (refcounted via paneState).
  const SlotDockSeat = () => (
    <SlotDockChip onOpen={() => ctx.sidebarRight.openTab('slot-health')} />
  )
  const disposeDock = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'slot-health', order: -10 },
    SlotDockSeat,
  ))

  // The effect body runs immediately and must RETURN the disposer; the
  // disposer runs at fiber unload.
  ctx.effect(() => () => {
    disposeDock()
    disposeTitle()
    disposeBody()
    disposeType()
  }, 'slot-health: rightbar tab type')
}
