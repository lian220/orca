import { admitStructuredAgentSessionInput } from '../native-chat/agent-session-wire/structured-agent-session-input-admission'
import { agentSessionFailureFact } from '../../shared/agent-session/failures/agent-session-failure'
import { agentSessionFailureWords } from '../../shared/agent-session/failures/agent-session-failure-words'
import type {
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAdapter
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { applyAcpMessageOptions } from './acp-message-execution-options'
import { acpDispatchPrompt } from './acp-prompt-content'
import { rejectedAcpDispatch, type AcpStructuredSession } from './acp-structured-session'

export async function dispatchAcpSession(
  input: Parameters<StructuredAgentSessionAdapter['dispatch']>[0],
  session: AcpStructuredSession,
  isCurrent: () => boolean,
  setOption: StructuredAgentSessionAdapter['setOption'],
  now: () => number
): Promise<AgentSessionDispatchOutcome> {
  // A strict agent refuses a send into its running turn rather than cancelling or queueing it.
  // The host already refuses such sends with turnActive; this closes the race inside the adapter.
  const busy = (): AgentSessionDispatchOutcome | null =>
    session.spec.concurrentSendPolicy === 'reject' && session.turns.running
      ? {
          state: 'rejected',
          ...agentSessionFailureWords(agentSessionFailureFact('notDelivered'), {
            surface: 'rejection'
          })
        }
      : null
  const beforePreparation = busy()
  if (beforePreparation) {
    return beforePreparation
  }
  const prompt = await acpDispatchPrompt(input.body, session)
  if (!Array.isArray(prompt)) {
    return { state: 'rejected', ...prompt }
  }
  if (!isCurrent() || session.journalClosed !== null) {
    // Attachment reads may outlive the child; this send never reached it.
    return rejectedAcpDispatch(session)
  }
  const { sessionId, fence, signal } = input
  signal?.throwIfAborted()
  input.onInputPreparation?.()
  const optionsApplied = await applyAcpMessageOptions(
    session,
    input.executionOptions,
    (key, value) => setOption({ sessionId, fence, key, value, signal }),
    () => isCurrent() && session.journalClosed === null,
    signal
  )
  if (!optionsApplied) {
    return rejectedAcpDispatch(session)
  }
  input.signal?.throwIfAborted()
  await input.beforeDispatch?.()
  input.signal?.throwIfAborted()
  let rejection: AgentSessionDispatchOutcome | null = null
  await admitStructuredAgentSessionInput(input.admitFreshInput, () => {
    rejection = busy()
    if (rejection) {
      return
    }
    session.turns.dispatch({
      clientMessageId: input.clientMessageId,
      prompt,
      requestedAt: input.requestedAt ?? now()
    })
  })
  // Admission precedes provider confirmation of the send.
  return rejection ?? { state: 'admitted' }
}
