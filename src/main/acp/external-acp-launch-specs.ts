import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { directoryAccountBinding } from './acp-account-binding'
import { GENERIC_ACP_DIALECT } from './acp-dialects/acp-dialect'
import { HERMES_ACP_DIALECT } from './acp-dialects/hermes-dialect'
import type { AcpLaunchSpec } from './acp-launch-specs'
import {
  parseExternalAcpRegistrations,
  type ExternalAcpRegistration
} from './external-acp-registration'

type ReadResult =
  | { ok: true; specs: AcpLaunchSpec[] }
  | { ok: false; error: 'invalid-external-acp-registration' }

/** Hermes keeps one remote conversation per chat: never replace it, never send into a running turn. */
const STRICT_CONTINUITY_AGENTS: ReadonlySet<string> = new Set(['hermes', 'team-agent'])

function launchSpec(entry: ExternalAcpRegistration): AcpLaunchSpec {
  const identity = createHash('sha256').update(JSON.stringify(entry)).digest('hex').slice(0, 24)
  return {
    agent: entry.agent,
    externalRegistration: true,
    ...(STRICT_CONTINUITY_AGENTS.has(entry.agent)
      ? { resumeFailurePolicy: 'fail' as const, concurrentSendPolicy: 'reject' as const }
      : {}),
    command: entry.command,
    ignoreAgentCommandSetting: true,
    args: () => [...entry.args],
    env: {},
    dialect: entry.agent === 'hermes' ? HERMES_ACP_DIALECT : GENERIC_ACP_DIALECT,
    loginCommand: [],
    account: directoryAccountBinding(`ORCA_EXTERNAL_ACP_${identity.toUpperCase()}`, () => identity),
    installDirectories: () => [],
    modelDiscovery: {
      kind: 'unavailable',
      reason: 'Models are reported by the running external ACP agent.'
    },
    transcriptImport: null,
    sessionHistory: {
      rowAgents: [],
      rowSessionId: (link) => link.handle.nativeId,
      parseResumeArgs: () => null
    }
  }
}

/** Only a private, owner-only regular file registers programs that run as this user. */
export function readExternalAcpLaunchSpecs(
  path: string | undefined,
  reserved: readonly string[],
  defaultPath?: string
): ReadResult {
  const registrationPath = path ?? defaultPath
  if (!registrationPath) {
    return { ok: true, specs: [] }
  }
  const invalid = { ok: false, error: 'invalid-external-acp-registration' } as const
  if (!isAbsolute(registrationPath)) {
    return invalid
  }
  let fd: number | undefined
  try {
    fd = openSync(registrationPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (
      !stat.isFile() ||
      stat.size > 131072 ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))
    ) {
      return invalid
    }
    const parsed = parseExternalAcpRegistrations(JSON.parse(readFileSync(fd, 'utf8')), reserved)
    return parsed.ok ? { ok: true, specs: parsed.registrations.map(launchSpec) } : invalid
  } catch (error) {
    // An absent default file is simply no registration; an explicit path must exist.
    if (!path && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ok: true, specs: [] }
    }
    return invalid
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
}
