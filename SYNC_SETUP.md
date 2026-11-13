# Google Drive sync: one-time setup

Songbook syncs through a hidden Google Drive folder that only this app can see (the `drive.appdata` permission).
It cannot see your other Drive files. You need your own Google Cloud project; nothing here is shared with anyone.

Client IDs are not secrets, but keep them out of git: put them in `.env.local` (already git-ignored).
Never paste a client secret, token or password into a chat or a commit.

## 1. Create the project and turn on Drive

1. Open https://console.cloud.google.com and create a project (for example "Songbook").
2. APIs & Services > Library > search "Google Drive API" > Enable.
3. APIs & Services > OAuth consent screen (Google Auth Platform):
   - User type: External. App name: Songbook. Add your own Google address as the support and contact email.
   - Add yourself under **Test users**. While the app is in "Testing", only test users can sign in, which is what you want.
   - Under Data Access, add the scope `.../auth/drive.appdata`.
   - Note: in Testing mode Google expires refresh tokens after 7 days, so you will be asked to sign in again about weekly.
     Publishing the app to "In production" removes that; for the sensitive-scope check on `drive.appdata` Google does not
     require verification for personal use under 100 users, but check Google's current rules.

## 2. Android client

1. APIs & Services > Credentials > Create credentials > OAuth client ID > **Android**.
2. Package name: `com.yourname.lyricslibrary` (from `app.json`).
3. SHA-1 certificate fingerprint of the key that signs your build. For debug builds:
   `cd android && ./gradlew signingReport` (use the `debug` variant SHA1). A release build uses its own key, so add that one too.
4. Open the new client > **Advanced settings** > turn on **Enable custom URI scheme**, and save. Without it Google answers
   `Error 400: invalid_request – Custom URI scheme is not enabled for your Android client`.
5. Copy the client ID (looks like `1234-abc.apps.googleusercontent.com`).

## 3. Web client (for the browser and desktop version)

1. Create credentials > OAuth client ID > **Web application**.
2. Authorized JavaScript origins: `http://localhost:8081` (and any other address you run the web app on).
3. Authorized redirect URIs: the same addresses with a trailing `/`, for example `http://localhost:8081/`.
4. Copy the client ID. You do not need the client secret; do not use it.

## 4. Put the IDs in `.env.local`

```
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<android client id>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>
```

## 5. Rebuild

- Android: the sign-in needs new native code (browser, secure storage) and a URL scheme made from your client ID,
  so regenerate the native project and rebuild the dev client once: `npm run prebuild:android` (it also rewrites
  `android/local.properties`, which prebuild deletes), then `npx expo run:android`. Without the prebuild the app has no
  intent filter for Google's redirect and the sign-in ends on google.com.
- Web: restart `npx expo start --web`.

Then open Settings > Google Drive > **Sign in and sync**.

## 6. Desktop app (Windows)

The desktop app is an Electron window around the web build. Google refuses sign-in inside embedded windows, so it signs in
through your normal browser and the browser comes back to a small server inside the app.

1. In the same **Web** client add the JavaScript origin `http://localhost:8765` and the redirect URI
   `http://localhost:8765/oauth-callback`.
2. `npm run desktop` builds the web export (with your client ID from `.env.local`) and opens the window.
   `npm run desktop:run` opens it again without rebuilding.
3. Settings > Google Drive > **Sign in and sync**. Port 8765 must be free; the window keeps its own library in the
   browser storage of that address, so keep the port the same.
4. Like the web version, the sign-in lasts about an hour, then Sync asks again.

## How it behaves

- Sync downloads the Drive copy, merges it with this device song by song (the newest edit wins), and uploads the result.
- Deleting a song is kept for 30 days so other devices learn of it; a device not synced for longer can bring a deleted song back.
- The merge compares the clocks of your devices, so keep their date and time set automatically.
- Two devices syncing at the very same moment can overwrite each other once; the next sync repairs it.
- On the web the sign-in lasts about an hour, then Sync asks you to sign in again. Android keeps you signed in.

## Optional: stay signed in on the desktop app

Without this, the desktop window asks you to sign in again about every hour. With it, it signs in once and keeps going.

1. Google Cloud console, same project, **APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Desktop app**. No redirect URI is needed.
2. Add two lines to `.env.local` (never commit it, never paste it into chat):
   ```
   SONGBOOK_DESKTOP_CLIENT_ID=...
   SONGBOOK_DESKTOP_CLIENT_SECRET=...
   ```
3. Restart the desktop app (`npm run desktop:run`) and sign in once from the cloud button.

The refresh token is stored encrypted by the operating system in the app's data folder. Signing out in Settings removes and revokes it. Android and the plain web build are unchanged.
