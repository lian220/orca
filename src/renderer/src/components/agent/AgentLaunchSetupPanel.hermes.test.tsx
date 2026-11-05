// @vitest-environment happy-dom
import { entry, root } from './agent-launch-setup-panel-test-fixture'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AgentLaunchPickerMenu } from './AgentLaunchPickerMenu'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'

vi.mock('@/hooks/useShortcutLabel', () => ({ useOptionalShortcutLabel: () => null }))

it.each(['chat', 'terminal'] as const)(
  'Hermes %s 기본 설정도 모델 검색 결과로 선택해 시작할 수 없다',
  (surface) => {
    act(() =>
      root.render(
        <TooltipProvider>
          <DropdownMenu open>
            <DropdownMenuContent>
              <AgentLaunchPickerMenu
                entries={[
                  {
                    ...entry,
                    agent: 'hermes',
                    label: 'Hermes',
                    defaultSurface: surface,
                    rows: [{ kind: 'chat', agent: 'hermes' }],
                    catalog: {
                      origin: 'probe',
                      fetchedAt: 1,
                      models: [
                        { id: 'hermes-model', label: 'Hermes Model', isDefault: true, efforts: [] }
                      ]
                    }
                  }
                ]}
                runLaunch={vi.fn()}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      )
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hermes-model' } })
    expect(screen.queryByRole('menuitem', { name: /Hermes ·/ })).toBeNull()
    expect(
      screen.queryAllByRole('menuitem').filter((item) => !item.hasAttribute('data-disabled'))
    ).toHaveLength(0)
  }
)
