import type { ClientCapabilities } from './generated/acp-protocol.generated'

/** Orca renders chats only; a dialect may add extension metadata the agent keys behaviour on. */
export function acpClientCapabilities(meta?: ClientCapabilities['_meta']): ClientCapabilities {
  return {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
    ...(meta === undefined ? {} : { _meta: meta })
  }
}
