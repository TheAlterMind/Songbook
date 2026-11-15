import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitLibraryChanged } from '../utils/libraryEvents';
import { DriveAuthError, downloadSnapshot, uploadSnapshot } from './driveClient';
import { dropCachedToken, getAccessToken } from './googleAuth';
import { mergeRemoteIntoLocal } from './localStore';

const LAST_SYNC_KEY = 'songbook.sync.lastSyncedAt';

let running: Promise<number> | null = null;

export async function getLastSyncedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

const LAST_ERROR_KEY = 'songbook.sync.lastError';

/** Why the last sync failed, or null when it worked (or has not run). Backed-up automatic syncs fail quietly, so Settings shows this. */
export async function getLastSyncError(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ERROR_KEY);
  } catch {
    return null;
  }
}

/** Runs one sync and remembers whether it worked. Not being signed in is not a failure. */
async function runOnce(interactive: boolean): Promise<number> {
  try {
    const count = await runSync(interactive);
    AsyncStorage.removeItem(LAST_ERROR_KEY).catch(() => {});
    return count;
  } catch (e: any) {
    if (e?.name !== 'NotSignedInError') {
      AsyncStorage.setItem(LAST_ERROR_KEY, e?.message || 'Something went wrong.').catch(() => {});
    }
    throw e;
  }
}

async function runSync(interactive: boolean): Promise<number> {
  const token = await getAccessToken(interactive);
  const remote = await downloadSnapshot(token);
  const merged = await mergeRemoteIntoLocal(remote);
  await uploadSnapshot(token, merged);
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    // Only the "last synced" label is lost.
  }
  emitLibraryChanged();
  return merged.songs.filter((s) => s.deletedAt == null).length;
}

/**
 * Downloads the Drive copy, merges it into this library, uploads the result and refreshes the screens.
 * Returns how many songs the library holds afterwards. Only one sync runs at a time.
 * With `interactive` false it never opens the Google sign-in screen (it throws NotSignedInError instead).
 */
export function syncNow(interactive = true): Promise<number> {
  if (!running) {
    running = (async () => {
      try {
        return await runOnce(interactive);
      } catch (e) {
        // A rejected token: drop it and try once more with a fresh one.
        if (e instanceof DriveAuthError) {
          dropCachedToken();
          return await runOnce(interactive);
        }
        throw e;
      }
    })().finally(() => {
      running = null;
    });
  }
  return running;
}
