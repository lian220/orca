import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const configPath = require.resolve('../electron-builder.lian.cjs')
function loadConfig(identity) {
  vi.stubEnv('ORCA_LIAN_SIGN_IDENTITY', identity)
  delete require.cache[configPath]
  return require(configPath)
}
const base = require('../electron-builder.config.cjs')
const identity = 'Apple Development: Personal Test (TEST123456)'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('signs the app and the pre-signed helpers with the same personal certificate', async () => {
  const config = loadConfig(identity)
  vi.stubEnv('CSC_NAME', '-')
  vi.stubEnv('ORCA_COMPUTER_MACOS_SIGN_IDENTITY', '-')
  const prepare = vi.spyOn(base, 'beforePack').mockImplementation(() => {
    expect(process.env.CSC_NAME).toBe(identity)
    expect(process.env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY).toBe(identity)
  })
  const context = { electronPlatformName: 'darwin', arch: 3 }
  await config.beforePack(context)
  expect(prepare).toHaveBeenCalledWith(context)
  expect(config.forceCodeSigning).toBe(true)
  expect(config.mac.identity).toBe(identity)
  expect(config.mac.entitlements).toBe(base.mac.entitlements)
  expect(config.afterPack).toBe(base.afterPack)
  expect(config.publish).toBeNull()
})

it('builds Orca Lian under its own identity, scheme and output', () => {
  const config = loadConfig(identity)
  expect(config.appId).toBe('com.lian.orca.lian')
  expect(config.productName).toBe('Orca Lian')
  expect(config.protocols).toEqual([{ name: 'Orca Lian', schemes: ['orca-lian'] }])
  expect(config.extraMetadata.name).toBe('orca-lian')
  expect(config.directories.output).toBe('dist-lian')
})

it.each(['', 'Orca Lian Local Signing'])(
  'rejects an absent or non-Apple identity: %s',
  (identity) => {
    expect(() => loadConfig(identity)).toThrow('ORCA_LIAN_SIGN_IDENTITY')
  }
)
