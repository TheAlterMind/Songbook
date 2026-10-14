const config = require('./app.json').expo;
const appConfig = { ...config, plugins: [...(config.plugins ?? []), './plugins/withOkHttp.cjs'] };

// Preview installs coexist with the original app and keep their own local data.
module.exports = () => process.env.SONGBOOK_PREVIEW === '1' ? {
  ...appConfig,
  name: 'Songbook Preview',
  android: { ...config.android, package: 'org.freevia.songbook.preview' },
  ios: { ...config.ios, bundleIdentifier: 'org.freevia.songbook.preview' },
} : appConfig;
