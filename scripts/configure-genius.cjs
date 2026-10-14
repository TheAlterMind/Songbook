// The resulting token is intentionally embedded in the installed app. It is not
// a client secret. Keep local build configuration out of source control.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const envFile = process.argv[2];
const supplied = envFile ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const token = (process.env.GENIUS_ACCESS_TOKEN || supplied.GENIUS_ACCESS_TOKEN || '').trim();
if (!token || /[\r\n]/.test(token)) {
  console.error('Provide GENIUS_ACCESS_TOKEN in the environment or pass an env-file path.');
  process.exit(1);
}
const target = path.join(__dirname, '..', 'src', 'lyrics', 'appToken.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, '// Public read-only app token: intentionally included in the mobile bundle.\n' +
  'export const GENIUS_ACCESS_TOKEN: string = ' + JSON.stringify(token) + ';\n');
console.log('Configured the embedded Genius app token.');
