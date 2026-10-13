const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Songbook: handle HTTP 103 Early Hints before reading the final response.';
const dependency = `${marker}
dependencies {
    implementation(platform("com.squareup.okhttp3:okhttp-bom:4.12.0"))
}
`;

function addOkHttpDependency(contents) {
  if (contents.includes(marker)) return contents;
  return `${contents.trimEnd()}\n\n${dependency}`;
}

// React Native 0.86 brings OkHttp 4.9.2. Songsterr sends HTTP 103 before HTTP
// 200; the 4.11/4.12 fixes consume that informational response correctly. Keep
// every OkHttp module aligned and retain Expo's streaming/cancellation support.
// https://github.com/square/okhttp/blob/master/docs/changelogs/changelog_4x.md
module.exports = function withOkHttp(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('Songbook HTTP compatibility requires a Groovy Android app build file.');
    }
    config.modResults.contents = addOkHttpDependency(config.modResults.contents);
    return config;
  });
};
module.exports.addOkHttpDependency = addOkHttpDependency;
