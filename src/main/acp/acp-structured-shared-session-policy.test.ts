import {
  closeProviderTimelineRigs,
  SESSION
} from '../native-chat/agent-session-timeline/provider-timeline-assembler-test-support'
import { StructuredAgentSessionInputNotAdmitted } from '../native-chat/agent-session-wire/structured-agent-session-input-admission'
import { afterEach, describe, expect, it } from 'vitest'
import { GROK, openAcpAdapterRig, sendHello } from './acp-structured-adapter.test-support'

afterEach(async () => {
  await closeProviderTimelineRigs()
})

const strict = {
  ...GROK,
  resumeFailurePolicy: 'fail' as const,
  concurrentSendPolicy: 'reject' as const
}

describe('ACP conversation continuity policy', () => {
  it.each([-32002, -32603])(
    'does not replace a saved conversation after load error %s',
    async (code) => {
      const rig = await openAcpAdapterRig({
        spec: strict,
        launch: {
          resume: {
            sessionId: 'saved-hermes',
            key: 'saved-hermes-key',
            mayBeUnsaved: () => false,
            unannouncedLosses: () => []
          }
        },
        script: (agent) =>
          agent.on('session/load', (frame) => agent.fail(frame, code, 'resume failed'))
      })
      await rig.acquire()
      expect(rig.openFailure()).toBeDefined()
      expect(rig.sent('session/new')).toHaveLength(0)
      expect(rig.sent('session/prompt')).toHaveLength(0)
    }
  )

  it('does not dispatch when host fresh input admission requires reacquisition', async () => {
    const rig = await openAcpAdapterRig({ spec: strict })
    await rig.acquire()
    await expect(
      rig.adapter.dispatch({
        sessionId: SESSION,
        fence: 1,
        clientMessageId: 'held-by-host',
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'held' }] },
        admitFreshInput: async () => ({ kind: 'acquire', reason: 'permission' })
      })
    ).rejects.toBeInstanceOf(StructuredAgentSessionInputNotAdmitted)
    expect(rig.sent('session/prompt')).toHaveLength(0)
  })

  it('refuses a second send without cancelling the first prompt', async () => {
    const rig = await openAcpAdapterRig({ spec: strict })
    await rig.acquire()
    await sendHello(rig, 'first-ui-operation')
    await rig.frame('session/prompt')
    const second = await sendHello(rig, 'second-ui-operation')
    expect(second).toMatchObject({ state: 'rejected', rejection: { kind: 'notDelivered' } })
    expect(rig.sent('session/cancel')).toHaveLength(0)
    expect(rig.sent('session/prompt')).toHaveLength(1)
  })
})
