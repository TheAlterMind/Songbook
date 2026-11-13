import { deleteSong, getSongCollectionIds, restoreSong, Song } from '../db/Database';
import { emitLibraryChanged } from './libraryEvents';

/**
 * Deletes a song and offers Undo. The song and its collections are kept in memory, so Undo puts them back
 * under the same id. `showUndo` is the toast's function.
 */
export async function deleteWithUndo(song: Song, showUndo: (message: string, onUndo: () => void) => void) {
  const collectionIds = await getSongCollectionIds(song.id as number);
  await deleteSong(song.id as number);
  emitLibraryChanged();
  showUndo(`Deleted "${song.title}"`, async () => {
    await restoreSong(song, collectionIds);
    emitLibraryChanged();
  });
}
