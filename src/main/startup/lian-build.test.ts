import { describe, expect, it } from 'vitest'
import { isLianBuild, lianProfilePath } from './lian-build'

describe('Orca Lian build boundary', () => {
  it('isolates Orca Lian from official and development conversations', () => {
    expect(lianProfilePath('Orca Lian', '/data')).toBe('/data/orca-lian')
    expect(lianProfilePath('Orca', '/data')).toBeNull()
    expect(lianProfilePath('Orca Dev', '/data')).toBeNull()
    expect(lianProfilePath('Orca Hermes', '/data')).toBeNull()
  })
  it('isolates verification data without replacing the login home', () => {
    expect(lianProfilePath('Orca Lian', '/data', '', '/tmp/probe')).toBe('/tmp/probe')
    expect(lianProfilePath('Orca', '/data', '', '/tmp/probe')).toBeNull()
    expect(() => lianProfilePath('Orca Lian', '/data', '', 'relative')).toThrow()
  })
  it('recognises the packaged executable so the official updater stays off', () => {
    expect(isLianBuild('Orca Lian')).toBe(true)
    expect(isLianBuild('Orca')).toBe(false)
    expect(isLianBuild('', '/Applications/Orca Lian.app/Contents/MacOS/Orca Lian')).toBe(true)
    expect(isLianBuild('', 'C:\\Program Files\\Orca Lian\\Orca Lian.exe')).toBe(true)
    expect(isLianBuild('', '/Applications/Orca.app/Contents/MacOS/Orca')).toBe(false)
  })
})
