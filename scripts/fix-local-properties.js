const fs = require('fs');
const path = require('path');

// Falls back to this machine's known SDK path if ANDROID_HOME / ANDROID_SDK_ROOT
// aren't set in the environment.
const sdkDir =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  'C:\\Users\\t.konstantinov\\AppData\\Local\\Android\\Sdk';

const target = path.join(__dirname, '..', 'android', 'local.properties');
const content = `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`;

fs.writeFileSync(target, content);
console.log('Wrote', target);
console.log(content.trim());
