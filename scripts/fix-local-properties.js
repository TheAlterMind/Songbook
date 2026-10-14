const fs = require('fs');
const path = require('path');
const os = require('os');

// Prefer an explicit SDK location; otherwise use the platform's conventional path.
const sdkDir =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
      : path.join(os.homedir(), 'Android', 'Sdk'));

const target = path.join(__dirname, '..', 'android', 'local.properties');
const content = `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`;

fs.writeFileSync(target, content);
console.log('Wrote', target);
console.log(content.trim());
