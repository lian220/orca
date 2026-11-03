import { isAbsolute, join } from 'node:path'

export function usesMaintainedUpdates(name: string, executable = ''): boolean {
  return name === 'Orca Hermes' || /(?:^|[/\\])Orca Hermes(?:\.exe)?$/.test(executable)
}

export function maintainedProfilePath(
  name: string,
  appData: string,
  executable = '',
  verificationProfile = ''
): string | null {
  if (!usesMaintainedUpdates(name, executable)) {
    return null
  }
  if (verificationProfile && !isAbsolute(verificationProfile)) {
    throw new Error('Maintained verification profile must be absolute')
  }
  return verificationProfile || join(appData, 'orca-hermes')
}
