// Personal Orca Lian build; local ad-hoc signing is explicit, with publishing disabled.
const { resolve } = require('node:path')
const base = require('./electron-builder.config.cjs')

const PRODUCT_NAME = 'Orca Lian'
const SLUG = 'orca-lian'
const OUTPUT = 'dist-lian'

const identity = process.env.ORCA_LIAN_SIGN_IDENTITY?.trim()
if (
  !identity ||
  (identity !== '-' && !/^(Apple Development|Developer ID Application): /u.test(identity))
) {
  throw new Error(
    'ORCA_LIAN_SIGN_IDENTITY must name your personal Apple signing certificate or explicitly use - for local ad-hoc signing'
  )
}

module.exports = {
  ...base,
  appId: 'com.lian.orca.lian',
  productName: PRODUCT_NAME,
  protocols: [{ name: PRODUCT_NAME, schemes: [SLUG] }],
  extraMetadata: { ...base.extraMetadata, name: SLUG, productName: PRODUCT_NAME },
  directories: { ...base.directories, output: OUTPUT },
  files: [...base.files, `!{.tmp,.artifacts,.git,.cache,cache,${OUTPUT}}{,/**/*}`],
  publish: null,
  beforePack(context) {
    // The base afterPack hook signs nested helpers before sealing the outer bundle.
    process.env.CSC_NAME = identity
    process.env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY = identity
    return base.beforePack(context)
  },
  mac: {
    ...base.mac,
    identity,
    sign: resolve(__dirname, 'scripts/desktop-distribution/macos/sign-mac-app.mjs'),
    timestamp: 'none',
    notarize: false,
    target: [{ target: 'dir', arch: ['arm64'] }]
  },
  forceCodeSigning: true
}
