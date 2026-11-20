# Songbook

A personal library of song lyrics (with optional chord lines) to read while playing. Android first, with a web build and a Windows desktop app. Songs live on the device, work offline, and sync through your own Google Drive.

## Features

- Collect songs by finding lyrics online or pasting them; organise them into collections and favourites
- Song screen built for playing: adjustable text size, full screen, double-tap to page through lyrics, screen stays awake
- Library sorts, card sizes, swipe actions and a "Last played" card
- Tools in Settings: metronome and guitar tuner (with tuning selector)
- Google Drive sync through the hidden app-data folder (the app cannot see your other files)

## Stack

Expo SDK 57, React Native 0.86, React Navigation, expo-sqlite, Electron (desktop).

## Getting started

```bash
npm install
npm start            # Expo dev server
npm run web          # web build
npm run desktop      # export web + launch the Electron app
npm run android      # build and run on a connected Android device or emulator
```

Android release build: `npx expo run:android --variant release --device <model> --port 8090`.

## Google Drive sync

Needs your own Google Cloud project. See [SYNC_SETUP.md](SYNC_SETUP.md). Keep client IDs in `.env.local` (git-ignored) and never commit secrets.

## Project docs

- [PRODUCT.md](PRODUCT.md): who the app is for and its constraints
- [DESIGN.md](DESIGN.md): the "Stage Light" design system

## Layout

- `src/`: app screens, components, theme, tools (metronome, tuner)
- `desktop/`: Electron wrapper
- `tools/bulk-add.html`: bulk song import helper
- `scripts/`: build helpers

## License

See [LICENSE](LICENSE).
