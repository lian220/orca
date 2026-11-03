import { useRef, type ReactNode } from 'react'
import { AgentSurfaceLaunchButton } from '@/components/agent/AgentSurfaceLaunchButton'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import { rowTitle } from './tab-agent-row-presentation'

const ROW_NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

// Why: the row starts its own surface; its trailing button (or ArrowRight, then Enter) opens the other.
export function SurfaceChoiceRow({
  row,
  other,
  label,
  disabled,
  runLaunch,
  children
}: {
  row: NewTabAgentMenuRow
  other: NewTabAgentMenuRow
  label: string
  disabled: boolean
  runLaunch: (row: NewTabAgentMenuRow) => void
  children: ReactNode
}): React.JSX.Element {
  const otherButton = useRef<HTMLButtonElement>(null)
  const releaseTarget = useRef<{ event: PointerEvent; target: EventTarget } | null>(null)
  const title = rowTitle(row, label)
  return (
    <DropdownMenuItem
      variant="launch"
      disabled={disabled}
      title={title}
      aria-label={title}
      onPointerUp={(event) => {
        // Radix synchronously clicks the row on drag release, discarding the release target.
        const release = { event: event.nativeEvent, target: event.target }
        releaseTarget.current = release
        queueMicrotask(() => {
          if (releaseTarget.current === release) {
            releaseTarget.current = null
          }
        })
      }}
      onClick={(event) => {
        const release = releaseTarget.current
        releaseTarget.current = null
        if (disabled) {
          return
        }
        const target =
          event.target === event.currentTarget && release && release.event.eventPhase !== Event.NONE
            ? release.target
            : event.target
        runLaunch(target instanceof Node && otherButton.current?.contains(target) ? other : row)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          otherButton.current?.focus()
        }
      }}
    >
      {children}
      <AgentSurfaceLaunchButton
        ref={otherButton}
        surface={other.kind === 'chat' ? 'chat' : 'terminal'}
        title={rowTitle(other, label)}
        className="hover:bg-accent focus-visible:bg-accent [[data-highlighted]_&]:opacity-100"
        onKeyDown={(event) => {
          // Stopped so the row's own Enter handling does not start the row's surface instead.
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.click()
          } else if (ROW_NAVIGATION_KEYS.has(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const item = event.currentTarget.closest<HTMLElement>('[role="menuitem"]')
            item?.focus()
            // Why: roving focus ignores keys from inside an item, so the row replays the move.
            if (event.key !== 'ArrowLeft') {
              item?.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }))
            }
          }
        }}
      />
    </DropdownMenuItem>
  )
}
