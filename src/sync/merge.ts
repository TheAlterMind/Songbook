import type { SongLine } from '../db/Database';

/** One song as stored in a sync snapshot. Identified by uid, never by the local numeric id. */
export interface SyncSong {
  uid: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
  language: string;
  year: string;
  key: string;
  favorite: boolean;
  cover: string | null;
  lines: SongLine[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SyncCollection {
  uid: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** Whether a song is in a collection. A removed link is kept (deleted: true) so the removal syncs. */
export interface SyncLink {
  collectionUid: string;
  songUid: string;
  updatedAt: number;
  deleted: boolean;
}

export interface Snapshot {
  version: 2;
  exportedAt: number;
  songs: SyncSong[];
  collections: SyncCollection[];
  links: SyncLink[];
}

/** Deleted records are kept this long so other devices can learn of the deletion, then dropped. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The record with the newer edit wins. On a tie a deletion wins over an edit, and otherwise the
 * first one (the local copy) stays, so the result does not depend on which device syncs first.
 */
function newest<T extends { updatedAt: number }>(a: T, b: T, isDeleted: (x: T) => boolean): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (isDeleted(a) !== isDeleted(b)) return isDeleted(a) ? a : b;
  return a;
}

function mergeById<T extends { updatedAt: number }>(
  local: T[],
  remote: T[],
  keyOf: (x: T) => string,
  isDeleted: (x: T) => boolean
): T[] {
  const byKey = new Map<string, T>();
  for (const item of local) byKey.set(keyOf(item), item);
  for (const item of remote) {
    const have = byKey.get(keyOf(item));
    byKey.set(keyOf(item), have ? newest(have, item, isDeleted) : item);
  }
  return [...byKey.values()];
}

/** Merges two snapshots song by song. Pure: it reads nothing and writes nothing. */
export function mergeSnapshots(local: Snapshot, remote: Snapshot | null, now: number): Snapshot {
  const empty: Snapshot = { version: 2, exportedAt: 0, songs: [], collections: [], links: [] };
  const other = remote ?? empty;
  const expired = (deletedAt: number | null) => deletedAt != null && now - deletedAt > TOMBSTONE_TTL_MS;

  const songs = mergeById(local.songs, other.songs, (s) => s.uid, (s) => s.deletedAt != null).filter(
    (s) => !expired(s.deletedAt)
  );
  const collections = mergeById(local.collections, other.collections, (c) => c.uid, (c) => c.deletedAt != null).filter(
    (c) => !expired(c.deletedAt)
  );

  const songUids = new Set(songs.map((s) => s.uid));
  const collectionUids = new Set(collections.map((c) => c.uid));
  const links = mergeById(
    local.links,
    other.links,
    (l) => `${l.collectionUid}|${l.songUid}`,
    (l) => l.deleted
  ).filter((l) => songUids.has(l.songUid) && collectionUids.has(l.collectionUid) && !(l.deleted && now - l.updatedAt > TOMBSTONE_TTL_MS));

  return { version: 2, exportedAt: now, songs, collections, links };
}
