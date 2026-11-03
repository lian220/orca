import {
  checkAgentCliVersion,
  type AgentCliVersionCheck,
  type AgentCliVersionReader
} from '../agent-cli-version-probe'
import type { AcpLaunchSpec } from './acp-launch-specs'
import type { AcpStructuredLaunch } from './acp-structured-launch-resolution'

export async function checkAcpLaunchVersion(
  spec: AcpLaunchSpec,
  launch: Pick<AcpStructuredLaunch, 'command' | 'prefixArgs' | 'cwd' | 'env'>,
  wantVersion: boolean,
  read?: AgentCliVersionReader
): Promise<AgentCliVersionCheck> {
  if (!spec.minimumVersions && !wantVersion) {
    return { status: 'unknown', version: null }
  }
  return checkAgentCliVersion(
    { program: launch.command, prefixArgs: launch.prefixArgs, cwd: launch.cwd, env: launch.env },
    spec.minimumVersions ?? [],
    read
  )
}
