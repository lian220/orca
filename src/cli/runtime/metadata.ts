import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  findTransport,
  getRuntimeMetadataPath,
  type RuntimeMetadata
} from '../../shared/runtime-bootstrap'
import { lianProfilePath } from '../../shared/lian-build'
import { RuntimeClientError } from './types'

export function readMetadata(userDataPath: string): RuntimeMetadata {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
    if (!metadata || !findTransport(metadata, 'unix', 'named-pipe') || !metadata.authToken) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Orca runtime metadata is incomplete at ${metadataPath}`
      )
    }
    return metadata
  } catch (error) {
    if (error instanceof RuntimeClientError) {
      throw error
    }
    throw new RuntimeClientError(
      'runtime_unavailable',
      `Could not read Orca runtime metadata at ${metadataPath}. Start the Orca app first.`
    )
  }
}

export function tryReadMetadata(userDataPath: string): RuntimeMetadata | null {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
  } catch {
    return null
  }
}

export function getDefaultUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  if (process.env.ORCA_USER_DATA_PATH) {
    return process.env.ORCA_USER_DATA_PATH
  }
  return getPlatformUserDataPath(platform, homeDir)
}

/** The packaged app's own default profile, ignoring any CLI override. */
export function getPlatformUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir(),
  executable = process.execPath
): string {
  const appData = getPlatformAppDataPath(platform, homeDir)
  // The bundled CLI runs on the app's own executable, so a personal build reads its own profile.
  return lianProfilePath('', appData, executable) ?? join(appData, 'orca')
}

function getPlatformAppDataPath(platform: NodeJS.Platform, homeDir: string): string {
  if (platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support')
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        'APPDATA is not set, so the Orca runtime metadata path cannot be resolved.'
      )
    }
    return appData
  }
  // Match Electron’s packaged userData path.
  return process.env.XDG_CONFIG_HOME || join(homeDir, '.config')
}
