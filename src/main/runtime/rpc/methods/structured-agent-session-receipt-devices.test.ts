import '../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { AgentSessionSubscribeInput } from '../../../native-chat/agent-session-wire/structured-agent-session-subscribers'
import {
  call,
  attachParams,
  clearStructuredHostStub,
  hostCalls,
  installStructuredHostStub,
  SESSION,
  STRUCTURED_CLIENT
} from './structured-agent-session-rpc.test-fixture'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'

const DEVICE_ID = '5d857d9e-ec3f-4762-b7f4-69691f580707'
const receipt: AgentJournalRenderItem = {
  itemId: 'question-1',
  sequence: 1,
  revision: 2,
  observedAt: 10,
  body: {
    kind: 'question',
    question: 'Which color?',
    options: [{ id: 'red', label: 'Red' }],
    resolution: {
      state: 'resolved',
      selectedOptionId: 'red',
      resolvedBy: DEVICE_ID,
      resolvedAt: 10
    }
  }
}

beforeEach(installStructuredHostStub)
afterEach(clearStructuredHostStub)

it('projects paired names onto historical receipts without changing the stored row', async () => {
  hostCalls.history.mockReturnValue({
    ok: true,
    page: { items: [receipt], submissions: [], removedItemIds: [] }
  })
  const response = await call(
    'agentSession.history',
    { sessionId: SESSION, direction: 'tail' },
    STRUCTURED_CLIENT,
    { readPairedDeviceName: (id: string) => (id === DEVICE_ID ? "Kelvin's iPhone" : null) }
  )
  expect(response).toMatchObject({
    ok: true,
    result: {
      page: {
        items: [
          {
            body: {
              resolution: {
                resolvedBy: DEVICE_ID,
                resolvedByDevice: { kind: 'named', name: "Kelvin's iPhone" }
              }
            }
          }
        ]
      }
    }
  })
  expect(receipt.body).toMatchObject({
    resolution: { resolvedBy: DEVICE_ID }
  })
  expect(receipt.body).not.toHaveProperty('resolution.resolvedByDevice')
})

it.each(['snapshot', 'batch', 'reset'] as const)(
  'identifies the reader on a live %s receipt',
  async (type) => {
    hostCalls.subscribe.mockImplementation((input: AgentSessionSubscribeInput) => {
      const base = { sessionId: SESSION, fence: 1 }
      if (type === 'batch') {
        input.emit({
          ...base,
          type,
          batch: {
            cursor: { epoch: 'a', sequence: 1 },
            items: [receipt],
            removedItemIds: [],
            submissions: []
          }
        })
      } else {
        const page = {
          sessionId: SESSION,
          epoch: 'a',
          direction: 'tail' as const,
          items: [receipt],
          removedItemIds: [],
          submissions: [],
          window: { oldest: null, newest: null, nextCursor: { epoch: 'a', sequence: 1 } },
          hasOlder: false,
          hasNewer: false
        }
        input.emit(
          type === 'snapshot'
            ? { ...base, type, page }
            : { ...base, type, page, reset: 'epoch_changed' }
        )
      }
      return () => {}
    })
    const response = await call(
      'agentSession.subscribe',
      { sessionId: SESSION },
      { ...STRUCTURED_CLIENT, clientId: DEVICE_ID }
    )
    const container = type === 'batch' ? 'batch' : 'page'
    expect(response).toMatchObject({
      ok: true,
      result: {
        [container]: {
          items: [{ body: { resolution: { resolvedByDevice: { kind: 'current' } } } }]
        }
      }
    })
    expect(receipt.body).not.toHaveProperty('resolution.resolvedByDevice')
  }
)

it.each(
  ['desktop-renderer', 'trusted-local:runtime'].flatMap((resolvedBy) =>
    [undefined, DEVICE_ID].map((clientId) => ({ resolvedBy, clientId }))
  )
)(
  'names a historical local answer for $resolvedBy read by $clientId',
  async ({ resolvedBy, clientId }) => {
    if (receipt.body.kind !== 'question') {
      throw new Error('expected question')
    }
    const item = {
      ...receipt,
      body: { ...receipt.body, resolution: { ...receipt.body.resolution, resolvedBy } }
    }
    hostCalls.history.mockReturnValue({
      ok: true,
      page: { items: [item], submissions: [], removedItemIds: [] }
    })
    const response = await call(
      'agentSession.history',
      { sessionId: SESSION, direction: 'tail' },
      { ...STRUCTURED_CLIENT, clientId },
      { readMachineName: () => 'Paired host alias', readSystemMachineName: () => 'Work Mac' }
    )
    expect(response).toMatchObject({
      ok: true,
      result: {
        page: {
          items: [
            {
              body: {
                resolution: {
                  resolvedByDevice: {
                    kind: 'named',
                    name: clientId ? 'Paired host alias' : 'Work Mac'
                  }
                }
              }
            }
          ]
        }
      }
    })
  }
)

it.each(['history', 'subscribe', 'ensure', 'create', 'item'] as const)(
  'publishes the ready machine name on the first local %s receipt',
  async (method) => {
    if (receipt.body.kind !== 'question') {
      throw new Error('expected question')
    }
    const item = {
      ...receipt,
      body: {
        ...receipt.body,
        resolution: { ...receipt.body.resolution, resolvedBy: 'desktop-renderer' }
      }
    }
    const page = {
      sessionId: SESSION,
      epoch: 'a',
      direction: 'tail' as const,
      items: [item],
      submissions: [],
      removedItemIds: [],
      window: { oldest: null, newest: null, nextCursor: { epoch: 'a', sequence: 1 } },
      hasOlder: false,
      hasNewer: false
    }
    hostCalls.history.mockReturnValue({ ok: true, page })
    hostCalls.journalSnapshot.mockReturnValue(page)
    hostCalls.attach.mockResolvedValue({ ok: true, value: { page } })
    hostCalls.subscribe.mockImplementation((input: AgentSessionSubscribeInput) => {
      input.emit({ type: 'snapshot', sessionId: SESSION, fence: 1, page })
      return () => {}
    })
    let name = 'host.example.internal'
    const response = await call(
      `agentSession.${method}`,
      method === 'ensure' || method === 'create'
        ? attachParams()
        : method === 'history'
          ? { sessionId: SESSION, direction: 'tail' }
          : method === 'item'
            ? { sessionId: SESSION, itemId: receipt.itemId }
            : { sessionId: SESSION },
      undefined,
      {
        readSystemMachineName: () => name,
        readMachineName: () => 'Paired host alias',
        machineNameReady: async () => {
          await Promise.resolve()
          name = 'Work Mac'
        }
      }
    )
    const projectedItem = {
      body: { resolution: { resolvedByDevice: { kind: 'named', name: 'Work Mac' } } }
    }
    expect(response).toMatchObject({
      ok: true,
      result:
        method === 'item'
          ? { item: projectedItem }
          : method === 'ensure' || method === 'create'
            ? { value: { page: { items: [projectedItem] } } }
            : { page: { items: [projectedItem] } }
    })
    expect(item.body.resolution).not.toHaveProperty('resolvedByDevice')
  }
)
