import type { ClientCapabilities } from './generated/acp-protocol.generated'

/** Orca renders chats only; a dialect may add capabilities and extension metadata the agent keys behaviour on. */
export function acpClientCapabilities(
  extra?: Pick<ClientCapabilities, 'elicitation'>,
  meta?: ClientCapabilities['_meta']
): ClientCapabilities {
  return {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
    ...extra,
    ...(meta === undefined ? {} : { _meta: meta })
  }
}
