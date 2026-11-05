import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPlatformUserDataPath } from './metadata'
import { getMacOpenArgs } from './launch'
import { pinLaunchUserDataPath, resolveLaunchUserDataPath } from './launch-user-data-path'

describe('resolveLaunchUserDataPath', () => {
  it('prefers ORCA_USER_DATA_PATH, made absolute', () => {
    expect(
      resolveLaunchUserDataPath({
        ORCA_USER_DATA_PATH: 'rel/profile',
        ORCA_DEV_USER_DATA_PATH: '/dev',
        ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1'
      })
    ).toBe(resolve('rel/profile'))
  })

  it("falls back to the dev app's own profile for a dev executable", () => {
    expect(resolveLaunchUserDataPath({ ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' })).toBe(
      resolve(join(getPlatformUserDataPath(), '..', 'orca-dev'))
    )
  })

  it('ignores ORCA_DEV_USER_DATA_PATH for a packaged executable', () => {
    expect(resolveLaunchUserDataPath({ ORCA_DEV_USER_DATA_PATH: '/dev' })).toBe(
      getPlatformUserDataPath()
    )
  })
})

describe('getPlatformUserDataPath', () => {
  it("reads the personal build's own profile when the CLI runs on its executable", () => {
    expect(
      getPlatformUserDataPath('darwin', '/Users/u', '/Apps/Orca Lian.app/Contents/MacOS/Orca Lian')
    ).toBe('/Users/u/Library/Application Support/orca-lian')
    expect(
      getPlatformUserDataPath('darwin', '/Users/u', '/Applications/Orca.app/Contents/MacOS/Orca')
    ).toBe('/Users/u/Library/Application Support/orca')
  })
})

describe('pinLaunchUserDataPath', () => {
  it('sets the dev override only for a dev executable', () => {
    expect(pinLaunchUserDataPath(['--no-sandbox'], {}, '/p')).toEqual({
      args: ['--no-sandbox', '--user-data-dir=/p'],
      env: { ORCA_USER_DATA_PATH: '/p' }
    })
    expect(
      pinLaunchUserDataPath([], { ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' }, '/p').env
    ).toMatchObject({ ORCA_DEV_USER_DATA_PATH: '/p' })
  })
})

describe('getMacOpenArgs', () => {
  it('reopens the bundle as before on the default profile', () => {
    expect(getMacOpenArgs('/Applications/Orca.app', getPlatformUserDataPath())).toEqual([
      '/Applications/Orca.app'
    ])
  })

  it('starts a new instance on another profile instead of activating the running app', () => {
    expect(getMacOpenArgs('/Applications/Orca.app', '/isolated/p')).toEqual([
      '-n',
      '/Applications/Orca.app',
      '--args',
      '--user-data-dir=/isolated/p'
    ])
  })
})
