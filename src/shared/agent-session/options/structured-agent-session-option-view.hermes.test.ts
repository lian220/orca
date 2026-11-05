import { describe, expect, it } from 'vitest'
import {
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState
} from './structured-agent-session-options'
import { structuredAgentSessionSeedCatalog } from './structured-agent-session-seed-catalog'
import {
  structuredAgentSessionMessageSelection,
  structuredAgentSessionShownSnapshot
} from './structured-agent-session-option-view'

describe('Hermes 표시 제거와 송신 호환성', () => {
  it.each([
    { host: '구버전 remote', acceptedInputSources: undefined },
    { host: '현재 host', acceptedInputSources: { model: 'saved' as const } }
  ])('$host: 정책값은 표시하지 않고 기존 송신 selection은 보존한다', ({ acceptedInputSources }) => {
    const seed = structuredAgentSessionSeedCatalog('hermes')
    const state = applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('hermes', seed),
      seed,
      {
        models: [{ id: 'auto-jev', label: 'Auto Jev', isDefault: true, efforts: [] }],
        current: {
          model: 'auto-jev',
          confirmed: ['model'],
          ...(acceptedInputSources ? { acceptedInputSources } : {})
        }
      }
    )
    expect(state.record.values.model).toEqual({ value: 'auto-jev', source: 'reported' })
    expect(structuredAgentSessionShownSnapshot(state)).toEqual([])
    expect(structuredAgentSessionMessageSelection(state)).toEqual({ model: 'auto-jev' })
    expect(state.record.values.model).toEqual({ value: 'auto-jev', source: 'reported' })
  })
})
