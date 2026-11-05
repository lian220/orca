// @vitest-environment happy-dom

import {
  mocks,
  answer,
  mutateWith,
  renderOptions,
  descriptor,
  ATTACHED,
  REOPENED,
  PROVISIONAL,
  type RenderProps
} from './use-structured-agent-session-options.test-fixture'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionOptionsResult } from '../../../../shared/agent-session/options/agent-session-options-result'
import {
  dispatchStructuredAgentSessionComposerCommand,
  structuredSessionSlashCommands
} from '../../../../shared/agent-session/view/structured-agent-session-composer'
import { forgetStructuredSessionSelection } from '@/lib/structured-agent-session-selection-controller'
import {
  recordHostModelCatalogSnapshot,
  resetHostModelCatalogSnapshotsForTests
} from '@/runtime/host-model-catalog-snapshots'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatComposerActions } from './NativeChatComposerActions'
import { MessageRow } from './NativeChatMessageRow'
import { projectStructuredAgentSessionMessages } from './structured-agent-session-message-projection'

const models = ['default-model', 'actual-model', 'next-model'].map((id) => ({
  id,
  label: `Catalog ${id}`,
  isDefault: id === 'default-model',
  efforts: [{ value: 'high', label: 'High' }]
}))

function response(current: AgentSessionOptionsResult['current']): AgentSessionOptionsResult {
  return { models, current }
}

function mountPicker(options: ReturnType<typeof renderOptions>, agent = 'hermes') {
  const props = () => ({
    agent,
    sessionOptionsSurface: options.result.current.optionSurface,
    sessionOptionsSnapshot: options.result.current.optionSnapshot,
    isWorking: false,
    attachDisabled: false,
    dictationDisabled: true,
    sendDisabled: false,
    isDictating: false,
    isDictationHoldMode: false,
    onAttach: vi.fn(),
    onDictationToggle: vi.fn(),
    onDictationHoldStart: vi.fn(),
    onDictationHoldEnd: vi.fn(),
    onSend: vi.fn()
  })
  const view = render(
    <TooltipProvider>
      <NativeChatComposerActions {...props()} />
    </TooltipProvider>
  )
  return () =>
    view.rerender(
      <TooltipProvider>
        <NativeChatComposerActions {...props()} />
      </TooltipProvider>
    )
}

function expectNoPicker() {
  expect(screen.queryByRole('button', { name: /model/i })).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByRole('option')).toBeNull()
  expect(screen.queryByText('High')).toBeNull()
}

beforeEach(() => {
  mocks.call.mockReset()
  mocks.enqueue.mockReset()
  mocks.hold.mockReset()
  mocks.toastError.mockReset()
  mocks.coherentCatalog = false
  mocks.sendSelection = false
  forgetStructuredSessionSelection('session-1')
  resetHostModelCatalogSnapshotsForTests()
  replaceRuntimeEnvironmentRevisions([{ id: 'server-1', createdAt: 1 }])
})
afterEach(cleanup)

describe('Hermes 모델 UI 제거·응답 푸터 보존', () => {
  it('새 대화에서 응답 전 seed와 기본 모델 및 선택 UI를 표시하지 않는다', () => {
    recordHostModelCatalogSnapshot({ kind: 'local' }, 'hermes', '', {
      origin: 'probe',
      models,
      fetchedAt: 1000,
      listingNamesConfiguredModel: true
    })
    answer({ modelCatalog: async () => ({ origin: 'probe', models, fetchedAt: 1000 }) })
    const { mutate } = mutateWith(async () => null)
    const options = renderOptions(
      { ...PROVISIONAL, agent: 'hermes', launchSeedOptions: { model: 'saved-model' } },
      mutate
    )
    mountPicker(options)
    expectNoPicker()
    expect(screen.queryByText(/saved-model|default-model/)).toBeNull()
    expect(descriptor(options.result.current.optionSnapshot, 'model')).toBeUndefined()
  })

  it.each([
    { model: 'saved-model' },
    { model: 'auto-jev', confirmed: ['model'] },
    { model: 'default-model', confirmed: ['model'], defaulted: ['model'] },
    {}
  ] satisfies AgentSessionOptionsResult['current'][])(
    '기존 대화에서 ACP 정책/저장/기본 모델 응답 %j을 표시하지 않는다',
    async (current) => {
      answer({ options: async () => response(current) })
      const { mutate } = mutateWith(async () => null)
      const options = renderOptions({ ...REOPENED, agent: 'hermes' }, mutate)
      await waitFor(() =>
        expect(options.result.current.sendSource.optionStateRef.current.optionsAnswerPresent).toBe(
          true
        )
      )
      mountPicker(options)
      expectNoPicker()
      expect(screen.queryByText(/auto-jev|saved-model|default-model/)).toBeNull()
      expect(descriptor(options.result.current.optionSnapshot, 'model')).toBeUndefined()
    }
  )

  it.each([
    { ...ATTACHED },
    { ...REOPENED },
    { ...REOPENED, paired: true }
  ] satisfies RenderProps[])(
    '새/기존/remote 대화 %j에서 confirmed 정책값 수신·갱신을 별도 모델 표시로 렌더하지 않는다',
    async (initial) => {
      let current = response({ model: 'auto-jev', confirmed: ['model'] })
      let reads = 0
      answer({
        options: async () => {
          reads += 1
          return current
        }
      })
      const { mutate } = mutateWith(async () => null)
      const props = {
        ...initial,
        agent: 'hermes' as const,
        launchSeedOptions: { model: 'saved-model' }
      }
      const options = renderOptions(props, mutate)
      await waitFor(() =>
        expect(
          options.result.current.sendSource.optionStateRef.current.record.values.model?.source
        ).toBe('reported')
      )
      const redraw = mountPicker(options)
      expect(screen.queryByText('auto-jev')).toBeNull()
      expectNoPicker()
      expect(descriptor(options.result.current.optionSnapshot, 'model')).toBeUndefined()

      current = response({ model: 'next-model', confirmed: ['model'] })
      options.rerender({ ...props, turnId: 'turn-2' })
      await waitFor(() =>
        expect(
          options.result.current.sendSource.optionStateRef.current.record.values.model?.value
        ).toBe('next-model')
      )
      redraw()
      expect(screen.queryByText(/next-model|auto-jev/)).toBeNull()
      expect(descriptor(options.result.current.optionSnapshot, 'model')).toBeUndefined()
      expectNoPicker()

      current = response({})
      options.rerender({ ...props, turnId: 'turn-3' })
      await waitFor(() => expect(reads).toBe(3))
      redraw()
      expect(screen.queryByText(/next-model|saved-model|default-model/)).toBeNull()
      expectNoPicker()
    }
  )

  it('직접 setter와 surface로도 Hermes 모델 및 모델 옵션 변경을 거절한다', async () => {
    answer({ options: async () => response({ model: 'auto-jev', confirmed: ['model'] }) })
    const { mutate, calls } = mutateWith(async () => ({ options: { model: 'next-model' } }))
    const options = renderOptions({ ...REOPENED, agent: 'hermes', paired: true }, mutate)
    await waitFor(() =>
      expect(
        options.result.current.sendSource.optionStateRef.current.record.values.model?.source
      ).toBe('reported')
    )
    await act(async () => {
      expect(await options.result.current.setStructuredOption('model', 'next-model')).toBe(false)
      expect(await options.result.current.setStructuredOption('effort', 'high')).toBe(false)
      await options.result.current.optionSurface.setOption('model', 'next-model')
    })
    expect(calls).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.hold).not.toHaveBeenCalled()
    expect(
      options.result.current.sendSource.optionStateRef.current.record.values.model?.value
    ).toBe('auto-jev')
    expect(descriptor(options.result.current.optionSnapshot, 'model')).toBeUndefined()
  })

  it.each([
    { text: '답변입니다.\n\n응답: Hermes · Claude Opus 4.7', footer: true },
    { text: '답변입니다.', footer: false }
  ])(
    '기존 응답 본문 푸터를 보존하고 별도 모델 표시를 만들지 않는다: %j',
    async ({ text, footer }) => {
      answer({ options: async () => response({ model: 'auto-jev', confirmed: ['model'] }) })
      const { mutate } = mutateWith(async () => null)
      const options = renderOptions({ ...REOPENED, agent: 'hermes' }, mutate)
      await waitFor(() =>
        expect(options.result.current.sendSource.optionStateRef.current.optionsAnswerPresent).toBe(
          true
        )
      )
      mountPicker(options)
      const [message] = projectStructuredAgentSessionMessages(
        [
          {
            itemId: 'hermes-reply',
            revision: 1,
            sequence: 1,
            observedAt: 1000,
            body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text }] }
          }
        ],
        [],
        []
      )
      if (!message) {
        throw new Error('Hermes 응답 projection 누락')
      }
      expect(message.blocks).toEqual([{ type: 'text', text }])
      render(
        <TooltipProvider>
          <MessageRow message={message} expandSignal={false} onScrollMessageToTop={vi.fn()} />
        </TooltipProvider>
      )
      expect(await screen.findByText('답변입니다.')).toBeTruthy()
      expect(screen.queryAllByText('응답: Hermes · Claude Opus 4.7')).toHaveLength(footer ? 1 : 0)
      expect(screen.queryByText('auto-jev')).toBeNull()
      expectNoPicker()
    }
  )

  it('Hermes slash 목록에서 선택 명령을 제거한다', () => {
    const commands = structuredSessionSlashCommands(
      'hermes',
      [],
      [
        { name: 'model', kind: 'command', description: 'Model' },
        { name: 'effort', kind: 'command', description: 'Effort' },
        { name: 'help', kind: 'command', description: 'Help' }
      ]
    )
    expect(commands.map(({ name }) => name)).toEqual(['help'])
  })

  it('Hermes 선택 명령 직접 입력도 변경 action으로 보내지 않는다', async () => {
    const setOption = vi.fn(async () => true)
    const invokeAction = vi.fn(async () => true)
    for (const text of ['/model', '/model next-model', '/effort high']) {
      expect(
        await dispatchStructuredAgentSessionComposerCommand(text, {
          agent: 'hermes',
          snapshot: [],
          setOption,
          invokeAction
        })
      ).toMatchObject({ handled: true, accepted: false })
    }
    expect(setOption).not.toHaveBeenCalled()
    expect(invokeAction).not.toHaveBeenCalled()
  })

  it.each(['codex', 'claude'] as const)(
    '%s의 모델 표시와 선택 action을 유지한다',
    async (agent) => {
      let model = 'actual-model'
      answer({ options: async () => response({ model, confirmed: ['model'] }) })
      const { mutate, calls } = mutateWith(async () => {
        model = 'next-model'
        return { options: { model } }
      })
      const options = renderOptions({ ...REOPENED, agent }, mutate)
      await waitFor(() =>
        expect(descriptor(options.result.current.optionSnapshot, 'model')?.settable).toBe(true)
      )
      mountPicker(options, agent)
      fireEvent.click(screen.getByRole('button', { name: /Model/ }))
      fireEvent.click(await screen.findByRole('option', { name: /Catalog next-model/ }))
      await waitFor(() => expect(calls).toHaveBeenCalled())
      await waitFor(() =>
        expect(descriptor(options.result.current.optionSnapshot, 'model')?.kind.currentValue).toBe(
          'next-model'
        )
      )
      expect(
        structuredSessionSlashCommands(agent, [], undefined).some(({ name }) => name === 'model')
      ).toBe(true)
    }
  )
})
