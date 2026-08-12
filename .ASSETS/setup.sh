#!/usr/bin/env bash
set -e

# One-shot setup for "My Lyrics Library"
# Run this script from the folder where you want the project created, e.g.:
#   cd ~/Documents
#   bash setup.sh
#
# Requires: Node.js (LTS) installed, and an internet connection.
# This script needs network access, which is why it must run on YOUR machine,
# not inside Claude's sandboxed environment.

PACKAGE_NAME="com.yourname.lyricslibrary"   # <-- change this before running if you like

echo "==> Creating Expo project..."
npx create-expo-app LyricsLibrary --template blank-typescript
cd LyricsLibrary

echo "==> Installing dependencies..."
npx expo install expo-sqlite expo-clipboard react-native-webview @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

echo "==> Copying app source files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/App.tsx" ./App.tsx
rm -rf ./src
cp -r "$SCRIPT_DIR/src" ./src

echo "==> Setting Android package name in app.json..."
node -e "
const fs = require('fs');
const path = './app.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
config.expo.name = 'Lyrics Library';
config.expo.slug = 'lyrics-library';
config.expo.android = config.expo.android || {};
config.expo.android.package = '$PACKAGE_NAME';
fs.writeFileSync(path, JSON.stringify(config, null, 2));
"

echo "==> Generating native Android project..."
npx expo prebuild -p android

echo ""
echo "Done. Open the 'android' folder (inside LyricsLibrary) in Android Studio:"
echo "  $(pwd)/android"
