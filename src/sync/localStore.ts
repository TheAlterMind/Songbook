import { getDb } from '../db/Database';
import { mergeSnapshots, Snapshot, SyncCollection, SyncLink, SyncSong } from './merge';

/** Reads the whole library, deleted records included, keyed by uid instead of local id. */
export async function getSyncSnapshot(): Promise<Snapshot> {
  const db = await getDb();
  const songRows = await db.getAllAsync<any>('SELECT * FROM songs');
  const collectionRows = await db.getAllAsync<any>('SELECT * FROM collections');
  const linkRows = await db.getAllAsync<any>(
    `SELECT c.uid AS collectionUid, s.uid AS songUid, l.updatedAt AS updatedAt, l.deleted AS deleted, l.position AS position
     FROM collection_songs l
     JOIN collections c ON c.id = l.collection_id
     JOIN songs s ON s.id = l.song_id`
  );

  const songs: SyncSong[] = songRows.map((r) => ({
    uid: r.uid,
    title: r.title,
    artist: r.artist,
    album: r.album ?? '',
    genre: r.genre ?? '',
    mood: r.mood ?? '',
    language: r.language ?? '',
    year: r.year ?? '',
    key: r.key ?? '',
    favorite: !!r.favorite,
    cover: r.cover ?? null,
    lines: JSON.parse(r.linesJson || '[]'),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
    deletedAt: r.deletedAt ?? null,
  }));
  const collections: SyncCollection[] = collectionRows.map((r) => ({
    uid: r.uid,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
    deletedAt: r.deletedAt ?? null,
  }));
  const links: SyncLink[] = linkRows.map((r) => ({
    collectionUid: r.collectionUid,
    songUid: r.songUid,
    updatedAt: r.updatedAt,
    deleted: !!r.deleted,
    position: r.position ?? null,
  }));
  return { version: 2, exportedAt: Date.now(), songs, collections, links };
}

/**
 * Writes a merged snapshot into the local database, all or nothing. Records that are unchanged are left alone,
 * records new to this device get a new local id, and deleted records past their keep time are removed for good.
 */
export async function applySnapshot(merged: Snapshot): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Songs
    const localSongs = await db.getAllAsync<{ id: number; uid: string; updatedAt: number | null; deletedAt: number | null }>(
      'SELECT id, uid, updatedAt, deletedAt FROM songs'
    );
    const songByUid = new Map(localSongs.map((s) => [s.uid, s]));
    const keptSongUids = new Set<string>();
    for (const s of merged.songs) {
      keptSongUids.add(s.uid);
      const have = songByUid.get(s.uid);
      const values = [
        s.title, s.artist, s.album, s.genre, s.mood, s.language, s.year, s.key,
        s.favorite ? 1 : 0, JSON.stringify(s.lines), s.cover, s.updatedAt, s.deletedAt,
      ];
      if (!have) {
        await db.runAsync(
          `INSERT INTO songs (title, artist, album, genre, mood, language, year, key, favorite, linesJson, cover, updatedAt, deletedAt, createdAt, uid)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...values, s.createdAt, s.uid
        );
      } else if (have.updatedAt !== s.updatedAt || (have.deletedAt ?? null) !== s.deletedAt) {
        await db.runAsync(
          `UPDATE songs SET title=?, artist=?, album=?, genre=?, mood=?, language=?, year=?, key=?, favorite=?, linesJson=?, cover=?, updatedAt=?, deletedAt=? WHERE id=?`,
          ...values, have.id
        );
      }
    }
    // A deleted song missing from the merge has passed its keep time.
    for (const s of localSongs) {
      if (!keptSongUids.has(s.uid) && s.deletedAt != null) {
        await db.runAsync('DELETE FROM collection_songs WHERE song_id=?', s.id);
        await db.runAsync('DELETE FROM songs WHERE id=?', s.id);
      }
    }

    // Collections
    const localCollections = await db.getAllAsync<{ id: number; uid: string; updatedAt: number | null; deletedAt: number | null }>(
      'SELECT id, uid, updatedAt, deletedAt FROM collections'
    );
    const collectionByUid = new Map(localCollections.map((c) => [c.uid, c]));
    const keptCollectionUids = new Set<string>();
    for (const c of merged.collections) {
      keptCollectionUids.add(c.uid);
      const have = collectionByUid.get(c.uid);
      if (!have) {
        await db.runAsync(
          'INSERT INTO collections (name, createdAt, uid, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?)',
          c.name, c.createdAt, c.uid, c.updatedAt, c.deletedAt
        );
      } else if (have.updatedAt !== c.updatedAt || (have.deletedAt ?? null) !== c.deletedAt) {
        await db.runAsync('UPDATE collections SET name=?, updatedAt=?, deletedAt=? WHERE id=?', c.name, c.updatedAt, c.deletedAt, have.id);
      }
    }
    for (const c of localCollections) {
      if (!keptCollectionUids.has(c.uid) && c.deletedAt != null) {
        await db.runAsync('DELETE FROM collection_songs WHERE collection_id=?', c.id);
        await db.runAsync('DELETE FROM collections WHERE id=?', c.id);
      }
    }

    // Links: look the local ids up again, since new rows were just added.
    const songIds = new Map((await db.getAllAsync<{ id: number; uid: string }>('SELECT id, uid FROM songs')).map((r) => [r.uid, r.id]));
    const collectionIds = new Map((await db.getAllAsync<{ id: number; uid: string }>('SELECT id, uid FROM collections')).map((r) => [r.uid, r.id]));
    for (const l of merged.links) {
      const songId = songIds.get(l.songUid);
      const collectionId = collectionIds.get(l.collectionUid);
      if (songId == null || collectionId == null) continue;
      await db.runAsync(
        `INSERT INTO collection_songs (collection_id, song_id, updatedAt, deleted, position) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection_id, song_id) DO UPDATE SET deleted=excluded.deleted, updatedAt=excluded.updatedAt,
           position=COALESCE(excluded.position, collection_songs.position)
         WHERE excluded.updatedAt > collection_songs.updatedAt`,
        collectionId, songId, l.updatedAt, l.deleted ? 1 : 0, l.position ?? null
      );
    }
    // A link missing from the merge was removed long ago; drop it for good.
    const keptLinks = new Set(merged.links.map((l) => `${l.collectionUid}|${l.songUid}`));
    const uidOfSong = new Map([...songIds].map(([uid, id]) => [id, uid]));
    const uidOfCollection = new Map([...collectionIds].map(([uid, id]) => [id, uid]));
    const localLinks = await db.getAllAsync<{ collection_id: number; song_id: number; deleted: number }>(
      'SELECT collection_id, song_id, deleted FROM collection_songs'
    );
    for (const l of localLinks) {
      const key = `${uidOfCollection.get(l.collection_id)}|${uidOfSong.get(l.song_id)}`;
      if (l.deleted && !keptLinks.has(key)) {
        await db.runAsync('DELETE FROM collection_songs WHERE collection_id=? AND song_id=?', l.collection_id, l.song_id);
      }
    }
  });
}

/**
 * Merges a snapshot from elsewhere into this library and returns the merged result, which is what to store
 * back at the other end. With no remote snapshot (a first sync) it just returns this library.
 */
export async function mergeRemoteIntoLocal(remote: Snapshot | null): Promise<Snapshot> {
  const local = await getSyncSnapshot();
  const merged = mergeSnapshots(local, remote, Date.now());
  await applySnapshot(merged);
  return merged;
}
