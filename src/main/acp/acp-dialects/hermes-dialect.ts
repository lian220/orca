import type { AcpDialect } from './acp-dialect'
import { questionRequest } from './grok-requests'

/** Hermes asks through Orca's own extension method and reuses the Grok question card contract. */
export const HERMES_ACP_DIALECT: AcpDialect = {
  clientCapabilitiesMeta: { 'orca.questionCards': 1 },
  request: (method, params) =>
    method === '_orca/ask_user_question' ? questionRequest(params) : undefined
}
