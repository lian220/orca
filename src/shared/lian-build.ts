import { isAbsolute, join } from 'node:path'

// The personal Orca Lian build keeps its own user data and never talks to the official updater.
const LIAN_PRODUCT_NAME = 'Orca Lian'
const LIAN_PROFILE = 'orca-lian'

/** Matches by product name, or by executable name since the packaged binary is named after it. */
export function isLianBuild(name: string, executable = ''): boolean {
  if (name === LIAN_PRODUCT_NAME) {
    return true
  }
  // Both separators: a Windows execPath is checked from macOS tests too.
  const executableName = (executable.split(/[/\\]/u).pop() ?? '').replace(/\.exe$/u, '')
  return executableName === LIAN_PRODUCT_NAME
}

export function lianProfilePath(
  name: string,
  appData: string,
  executable = '',
  verificationProfile = ''
): string | null {
  if (!isLianBuild(name, executable)) {
    return null
  }
  if (verificationProfile && !isAbsolute(verificationProfile)) {
    throw new Error('Orca Lian verification profile must be absolute')
  }
  return verificationProfile || join(appData, LIAN_PROFILE)
}
