// @vitest-environment happy-dom
import {
  AgentLaunchSetupPanel,
  entry,
  host,
  root,
  onUse
} from './agent-launch-setup-panel-test-fixture'
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

it.each(['chat', 'terminal'] as const)(
  'Hermes 새 탭 %s 기본 설정에서 저장 모델과 모델 검색·선택·옵션을 표시하지 않는다',
  (surface) => {
    act(() =>
      root.render(
        <TooltipProvider>
          <AgentLaunchSetupPanel
            entry={{
              ...entry,
              agent: 'hermes',
              label: 'Hermes',
              defaultSurface: surface,
              structured: { model: 'saved-model', options: { effort: 'high' } },
              catalog: {
                origin: 'probe',
                fetchedAt: 1,
                models: [
                  {
                    id: 'default-model',
                    label: 'Hermes Default',
                    isDefault: true,
                    efforts: [{ value: 'high', label: 'High' }]
                  }
                ]
              }
            }}
            onUse={onUse}
          />
        </TooltipProvider>
      )
    )
    expect(host.querySelector('[aria-label="Search models"]')).toBeNull()
    expect(host.textContent).not.toContain('Hermes Default')
    expect(host.textContent).not.toContain('saved-model')
    expect(host.textContent).not.toContain('High')
  }
)
