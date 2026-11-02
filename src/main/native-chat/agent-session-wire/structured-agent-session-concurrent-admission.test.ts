import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attach,
  CALLER,
  envelope,
  hostTestState
} from './structured-agent-session-host-test-harness'
import {
  HOST_TEST_SESSION as SESSION,
  hostTestMessage
} from './structured-agent-session-host-test-data'
import { StructuredAgentRegistry } from './structured-agent-registry'

afterEach(() => vi.restoreAllMocks())

function requireBusyRefusal() {
  const capabilities = StructuredAgentRegistry.prototype.capabilities
  vi.spyOn(StructuredAgentRegistry.prototype, 'capabilities').mockImplementation(function (
    this: StructuredAgentRegistry,
    agent: string
  ) {
    const existing = capabilities.call(this, agent)
    return existing ? { ...existing, concurrentSendPolicy: 'reject' as const } : existing
  })
}

describe('conversation owner concurrent-send admission', () => {
  it('serializes simultaneous requests from two clients before provider handover', async () => {
    requireBusyRefusal()
    const { host, dispatch, cancelTurn } = hostTestState()
    await attach()
    dispatch.mockResolvedValue({ state: 'admitted' })
    const sends = ['parallel first', 'parallel second'].map((text) => {
      const body = hostTestMessage(text)
      return { envelope: envelope('agentSession.send', { body }), body }
    })
    const results = await Promise.all(
      sends.map((send, index) => host.send({ callerKey: `parallel-client-${index}` }, send))
    )
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { ok: false, refusal: { details: { reason: 'turnActive' } } }
    ])
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
    expect(cancelTurn).not.toHaveBeenCalled()
    const journal = host.collaboratorsForTests().sessions.get(SESSION)!.journal
    expect(journal.submissions()).toHaveLength(1)
    expect(journal.queuedMessages.list()).toHaveLength(0)
  })

  it.each([undefined, 'queue-if-active'] as const)(
    'returns the second UI message unsent before queueing (%s)',
    async (delivery) => {
      requireBusyRefusal()
      const { host, dispatch, cancelTurn } = hostTestState()
      await attach()
      dispatch.mockResolvedValue({ state: 'admitted' })
      const firstBody = hostTestMessage('first UI active request')
      const first = {
        envelope: envelope('agentSession.send', { body: firstBody }),
        body: firstBody
      }
      expect(await host.send(CALLER, first)).toMatchObject({ ok: true })
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
      const body = hostTestMessage('second UI must remain unsent')
      const fields = { body, ...(delivery ? { delivery } : {}) }
      const second = { envelope: envelope('agentSession.send', fields), ...fields }
      const result = await host.send({ callerKey: 'client-2' }, second)
      expect(result).toMatchObject({
        ok: false,
        refusal: { code: 'agent_session_operation_invalid', details: { reason: 'turnActive' } }
      })
      const journal = host.collaboratorsForTests().sessions.get(SESSION)!.journal
      expect(
        journal
          .submissions()
          .some((row) => row.clientMessageId === second.envelope.clientOperationId)
      ).toBe(false)
      expect(journal.queuedMessages.list()).toHaveLength(0)
      expect(dispatch).toHaveBeenCalledOnce()
      expect(cancelTurn).not.toHaveBeenCalled()
      // The already accepted request is replayed, not newly refused or dispatched.
      expect(await host.send(CALLER, first)).toMatchObject({ ok: true, replayed: true })
      expect(dispatch).toHaveBeenCalledOnce()
    }
  )
})
