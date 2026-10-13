const config = require('./app.json').expo;

// Preview installs coexist with the original app and keep their own local data.
module.exports = () => process.env.SONGBOOK_PREVIEW === '1' ? {
  ...config,
  name: 'Songbook Preview',
  android: { ...config.android, package: 'org.freevia.songbook.preview' },
  ios: { ...config.ios, bundleIdentifier: 'org.freevia.songbook.preview' },
} : config;
