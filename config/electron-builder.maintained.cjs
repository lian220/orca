const base = require('./electron-builder.config.cjs')
module.exports = {
  ...base,
  appId: 'com.lian.orca.hermes',
  productName: 'Orca Hermes',
  protocols: [{ name: 'Orca Hermes', schemes: ['orca-hermes'] }],
  extraMetadata: { ...base.extraMetadata, name: 'orca-hermes', productName: 'Orca Hermes' },
  directories: { ...base.directories, output: 'dist-maintained' },
  publish: null,
  mac: {
    ...base.mac,
    identity: null,
    notarize: false,
    target: [{ target: 'dir', arch: ['arm64'] }]
  },
  forceCodeSigning: false
}
