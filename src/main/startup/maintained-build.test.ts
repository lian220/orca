import { describe, expect, it } from 'vitest'
import { maintainedProfilePath, usesMaintainedUpdates } from './maintained-build'

describe('maintained build boundary', () => {
  it('isolates the maintained app from official and development conversations', () => {
    expect(maintainedProfilePath('Orca Hermes', '/data')).toBe('/data/orca-hermes')
    expect(maintainedProfilePath('Orca', '/data')).toBeNull()
    expect(maintainedProfilePath('Orca Dev', '/data')).toBeNull()
  })
  it('isolates verification data without replacing the login home', () => {
    expect(maintainedProfilePath('Orca Hermes', '/data', '', '/tmp/probe')).toBe('/tmp/probe')
    expect(maintainedProfilePath('Orca', '/data', '', '/tmp/probe')).toBeNull()
    expect(() => maintainedProfilePath('Orca Hermes', '/data', '', 'relative')).toThrow()
  })
  it('never directs the maintained app to the official binary updater', () => {
    expect(usesMaintainedUpdates('Orca Hermes')).toBe(true)
    expect(usesMaintainedUpdates('Orca')).toBe(false)
    expect(
      usesMaintainedUpdates('Orca', '/Applications/Orca Hermes.app/Contents/MacOS/Orca Hermes')
    ).toBe(true)
  })
})
