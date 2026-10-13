// Builds a standalone Android APK for a phone (arm64) and emulator (x86_64).
// It uses the generated debug signing key for testing; no Metro server is needed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, SONGBOOK_PREVIEW: '1', CI: '1', NODE_ENV: 'production' };
function run(command, args) {
  const child = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status || 1);
}
if (!fs.existsSync(path.join(root, 'src/lyrics/appToken.ts'))) {
  run('node', ['scripts/configure-genius.cjs']);
}
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);
run('node', ['scripts/fix-local-properties.js']);
run(process.platform === 'win32' ? 'android\\gradlew.bat' : './android/gradlew', [
  '-p', 'android', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a,x86_64', '--max-workers=4', '--console=plain',
]);
const out = path.join(root, 'artifacts', 'songbook-preview.apk');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'), out);
console.log('Standalone test APK: ' + out);
