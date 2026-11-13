import { Platform } from 'react-native';

// expo-audio is a native module. It is loaded here, and only on a phone, so that a build made before it was added
// still starts (the Tools screen then says it needs an updated build) and so the web build never touches it.
type ExpoAudio = typeof import('expo-audio');

function load(): ExpoAudio | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-audio') as ExpoAudio;
  } catch {
    return null;
  }
}

/** The expo-audio module, or null on the web and in builds that do not include it. Decided once, at startup. */
export const nativeAudio: ExpoAudio | null = load();
