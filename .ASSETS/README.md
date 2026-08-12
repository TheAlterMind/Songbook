# Songbook

An offline-first personal lyrics library, native Android app, styled to the
"Nocturne" design system (dark background, purple accent, Inter typeface).

## Current state (as of this writing)

Fully working: build succeeds, app installs and runs on both an emulator and
a physical Android device. All screens below are implemented and functional.
Last commit pushed to GitHub: `40d3af2` on `main`.

## What it does

- **Library tab**: song list, sort by title/artist/year/genre/key/mood/favorites
  (tap the label to cycle field, tap the arrow to flip direction — blanks
  always sort last), expanded/compact view toggle, favorite star per song,
  "+" opens Add. **Long-press a song** → Duplicate or Delete (with confirm).
- **Search tab**: full-text search across your *saved* library (title,
  artist, album, lyrics) — separate from the web-search feature below.
- **Web search** (only reachable via the "Search the web" button inside the
  **Add** screen — not from the Library landing screen): opens an in-app
  browser to look up lyrics online. You select and copy the text yourself;
  the app never scrapes or auto-fetches. "Save from clipboard" returns you to
  Add with the lyrics (and a guessed title/artist) pre-filled.
- **Add / Edit song**: title, artist, album, genre, mood, language, year,
  key, favorite, plus a per-line chord editor — toggle "+ Chord" on any
  lyric line to add a chord row above it (space-align chords over words),
  transpose all chords up/down a semitone.
- **Detail screen**: live font-size adjustment (A−/A+), Chords On/Off toggle
  (only shown if the song has any), favorite star, edit and
  add-to-collection actions. **No delete here** — deletion only happens via
  long-press on the Library screen (deliberate choice, to prevent accidental
  taps from deleting a song you're just reading).
- **Collections tab**: create/view collections (playlists). Add a song to
  one or more collections from its Detail screen. Long-press a collection to
  delete it.
- **Settings tab**: accent color (5 options) + light/dark mode, both applied
  live app-wide; default text size and default chords-on for new song views;
  song count; Export/Import library (JSON, via share sheet / document picker,
  merge-on-import skipping exact title+artist duplicates — never destructive).

## Architecture

- **Theming**: `src/theme/ThemeContext.tsx` — React Context, colors/settings
  persisted via `@react-native-async-storage/async-storage` (survives app
  restart). Every screen reads colors via `useTheme()`; no hardcoded colors.
- **Navigation**: `App.tsx` — root Stack containing one Tab.Navigator
  (Library / Search / Collections / Settings — tab bar visible) plus sibling
  stack screens (WebSearch, Browser, Add, Edit, Detail, CollectionDetail,
  AddToCollection — tab bar hidden), matching the original design handoff's
  own screen-visibility rules.
- **Icons**: `src/components/Icons.tsx` — real SVG components (via
  `react-native-svg`), each one transcribed exactly from the original design
  handoff's own inline SVG markup (not custom/improvised shapes). Includes
  tab bar icons, header icons, star/chevron/plus/pencil, sort arrows.
- **Database**: `src/db/Database.ts` — SQLite (`expo-sqlite`), file
  `lyrics_library_v2.db` (bumped from `v1` deliberately — this was a full
  rebuild, not a migration, per an explicit decision not to preserve
  earlier test data):
  - `songs`: id, title, artist, album, genre, mood, language, year, key,
    favorite, `linesJson` (JSON array of `{text, chord}` — one row per lyric
    line, chord optional, space-aligned), createdAt
  - `collections`: id, name, createdAt
  - `collection_songs`: many-to-many join table
  - `duplicateSong(id)`: clones a song with `" (Copy)"` appended to the
    title, favorite reset to false
- **Chords**: per-line, not a single free-text block — matches the design.
  `src/utils/transpose.ts` ports the design's own note-shifting algorithm.
- **Sort**: `src/utils/sort.ts` — blanks always sort last regardless of
  direction.
- **Export/Import**: `src/utils/exportImport.ts` — uses `expo-file-system`,
  `expo-sharing`, `expo-document-picker`.

## Dependencies added beyond the Expo default template

```bash
npx expo install @react-navigation/bottom-tabs @react-native-async-storage/async-storage expo-file-system expo-sharing expo-document-picker react-native-svg
```
(All already installed as of the last commit — this is for reference if the
project is ever rebuilt from scratch.)

## Environment specifics for this machine (Windows, Valtech laptop)

These are the exact fixes that got the build working; if a fresh
conversation ever needs to debug a build issue on this same machine, start
here before re-diagnosing from scratch.

- **Terminal**: Git Bash (not PowerShell/CMD) — paste via right-click, not
  Ctrl+V.
- **Node/npm**: works fine directly in Git Bash (`node`, `npx`).
- **Gradle JDK must be 17, not Android Studio's bundled JDK 25.** Newer JDKs
  trigger a security warning that a bug in the Android Gradle Plugin's
  Prefab packaging step misreads as a fatal build error
  (`GeneratePrefabPackagesKt.reportErrors` → `IllegalStateException`).
  - Installed via: `winget install --id EclipseAdoptium.Temurin.17.JDK -e`
  - Actual install path: `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot`
  - Set in `android/gradle.properties`:
    ```
    org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.8-hotspot
    ```
  - Android Studio's own toolchain auto-provisioning
    (`android/gradle/gradle-daemon-jvm.properties`) does **not** work
    reliably here — if that file exists and keeps forcing JDK 25 regardless
    of Settings → Gradle JDK, delete it.
- **`android/local.properties` can go missing after `expo prebuild`** (it's
  not part of what Expo generates — normally Android Studio creates it on
  first open of a fresh `android` folder). **Fixed automatically now**: use
  `npm run prebuild:android` instead of `npx expo prebuild -p android`
  directly — it runs prebuild, then `scripts/fix-local-properties.js`
  recreates `local.properties` with the correct SDK path right after. If you
  ever need to do it manually:
  ```bash
  cd android
  echo "sdk.dir=C:\\\\Users\\\\t.konstantinov\\\\AppData\\\\Local\\\\Android\\\\Sdk" > local.properties
  ```
- **Android SDK / platform-tools path**:
  `C:\Users\t.konstantinov\AppData\Local\Android\Sdk\platform-tools\adb.exe`
  (not on Git Bash's PATH by default — call it by full path, or add it to
  PATH).
- **Physical device connects via wireless adb** (already paired to this
  machine). After every Metro restart / device reconnect, run:
  ```bash
  "/c/Users/t.konstantinov/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices
  "/c/Users/t.konstantinov/AppData/Local/Android/Sdk/platform-tools/adb.exe" -s <device-id-from-above> reverse tcp:8081 tcp:8081
  ```
  so the phone can reach Metro on `localhost:8081`. Corporate Wi-Fi may block
  device-to-device traffic (client isolation) — wireless adb + `reverse` is
  the reliable path here, more so than manually entering an IP in the app's
  dev menu.
- **Emulator** connects to Metro automatically via `10.0.2.2:8081` — no
  `adb reverse` needed for the emulator.
- **Network egress is disabled** in Claude's own sandboxed environment — any
  future Claude conversation working on this project cannot run
  `npm install`, `expo prebuild`, or reach the internet at all. All file
  changes have to be generated as content and manually pasted into the
  project by you in Git Bash — this has been the working pattern throughout.

## Day-to-day workflow

Two terminals, both from the project root (has `app.json`, not the
`android` subfolder):

```bash
# Terminal 1 — leave running
npx expo start

# Terminal 2 — one-off commands as needed
"/c/Users/t.konstantinov/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices
```

Rebuilding the native project from scratch (only needed if native deps
change):
```bash
npx expo prebuild -p android
```
Then reopen/re-sync `android` in Android Studio.

## Known limitations / deliberate design choices

- Search engine (`src/screens/WebSearchScreen.tsx`) defaults to Google —
  swap `SEARCH_ENGINE_BASE` for DuckDuckGo/Bing if it ever gets
  blocked/CAPTCHA'd inside the WebView.
- No lyrics are ever fetched, scraped, or cached automatically via any API
  — the only lyrics/chords text that enters the database is text personally
  selected, copied, and confirmed on the Add/Edit screen.
- The old `v1` database schema (single free-text chords block, fewer fields)
  is not migrated — this was a deliberate fresh start, not an oversight.

## Version control

Git repo, remote: `https://github.com/TheAlterMind/Lyrics-Library.git`
(note the capitalization — the repo was renamed from `lyrics-library` at
some point; if `git push` shows a "repository moved" notice, update the
remote: `git remote set-url origin https://github.com/TheAlterMind/Lyrics-Library.git`).

```bash
git add -A
git commit -m "describe what changed"
git push
```
