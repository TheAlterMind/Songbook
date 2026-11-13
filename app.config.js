// Extends app.json. Google's Android sign-in returns to a custom scheme made from the Android client id, so the
// scheme is built from EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID (set in .env.local, see SYNC_SETUP.md). Changing it
// needs a new native build.
module.exports = ({ config }) => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const scheme = clientId ? `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}` : 'songbook';
  return { ...config, scheme };
};
