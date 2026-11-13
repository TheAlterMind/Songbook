import AsyncStorage from '@react-native-async-storage/async-storage';

// When each song was last opened, by its id on this device. It is kept apart from the songs on purpose: opening a song
// is not an edit, so it must not change the song's sync time or travel to the other devices.
const KEY = 'songbook.openedAt';

/** The time (ms) each song was last opened, keyed by song id. Songs never opened are missing. */
export async function getOpenedMap(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Notes that a song has just been opened. */
export async function markOpened(songId: number): Promise<void> {
  try {
    const map = await getOpenedMap();
    map[String(songId)] = Date.now();
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Not worth bothering anyone: the song just won't move up the Opened order.
  }
}
