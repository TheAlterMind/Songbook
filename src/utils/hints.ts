import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time hints for gestures nobody would otherwise find. Whether a hint was shown is kept on this device only.
const PREFIX = 'songbook.hint.';

/** True when the hint has been dismissed (or used) before. A storage failure counts as seen: never nag. */
export async function hasSeenHint(name: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREFIX + name)) === '1';
  } catch {
    return true;
  }
}

export async function markHintSeen(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + name, '1');
  } catch {
    // The hint may show again next time; harmless.
  }
}
