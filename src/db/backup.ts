import type { Collection, LyricsProvenance, Song } from './Database';

export interface LibraryBackup {
  version: 1 | 2;
  exportedAt?: number;
  songs: Song[];
  collections: Collection[];
  links: { collection_id: number; song_id: number }[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`${label} must be text of at most ${max} characters.`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a valid integer.`);
  }
  return value;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`${label} must be a list with at most ${max} entries.`);
  }
  return value;
}

function optionalUrl(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  const source = text(value, label, 8192);
  let url: URL;
  try { url = new URL(source); } catch { throw new Error(`${label} must be a secure web address.`); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} must be a secure web address.`);
  }
  return source;
}

export function validateLyricsProvenance(value: unknown): LyricsProvenance | undefined {
  if (value == null) return undefined;
  const source = record(value, 'Lyrics source');
  const provider = text(source.provider, 'Lyrics provider', 80);
  const providerSongId = text(source.providerSongId, 'Provider song ID', 8192);
  if (!provider.trim() || !providerSongId.trim()) throw new Error('Lyrics source is missing its provider or song ID.');
  const result: LyricsProvenance = {
    provider,
    providerSongId,
    retrievedAt: integer(source.retrievedAt, 'Lyrics retrieval date'),
  };
  const sourceUrl = optionalUrl(source.sourceUrl, 'Lyrics source URL');
  if (sourceUrl) result.sourceUrl = sourceUrl;
  if (source.modifiedSinceImport != null) {
    if (typeof source.modifiedSinceImport !== 'boolean') throw new Error('Lyrics edit marker must be true or false.');
    result.modifiedSinceImport = source.modifiedSinceImport;
  }
  if (source.attribution != null) {
    const credit = record(source.attribution, 'Lyrics attribution');
    const name = text(credit.name, 'Lyrics attribution name', 1000);
    if (!name.trim()) throw new Error('Lyrics attribution needs a name.');
    result.attribution = { name };
    if (credit.text != null) result.attribution.text = text(credit.text, 'Lyrics attribution text', 2000);
    const url = optionalUrl(credit.url, 'Lyrics attribution URL');
    if (url) result.attribution.url = url;
  }
  return result;
}

export function readLyricsProvenance(value: unknown): LyricsProvenance | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try { return validateLyricsProvenance(JSON.parse(value)); } catch { return undefined; }
}

export function validateBackup(value: unknown): LibraryBackup {
  const data = record(value, 'Backup');
  if (data.version !== 1 && data.version !== 2) throw new Error('Unsupported backup version. Use a Songbook version 1 or 2 export.');
  const songIds = new Set<number>();
  const collectionIds = new Set<number>();
  const songs = array(data.songs, 'Songs', 10000).map((value, index): Song => {
    const source = record(value, `Song ${index + 1}`);
    const song: Song = {
      title: text(source.title, 'Song title', 2000),
      artist: text(source.artist, 'Song artist', 2000),
      lines: array(source.lines, 'Song lines', 20000).map((value) => {
        const line = record(value, 'Song line');
        return {
          text: text(line.text, 'Lyric line', 200000),
          ...(line.chord == null ? {} : { chord: text(line.chord, 'Chord line', 2000) }),
        };
      }),
    };
    if (song.lines.reduce((total, line) => total + line.text.length + (line.chord?.length || 0), 0) > 200000) {
      throw new Error('A song may contain at most 200000 lyric and chord characters.');
    }
    if (source.id != null) {
      song.id = integer(source.id, 'Song ID', 1);
      if (songIds.has(song.id)) throw new Error('Backup contains duplicate song IDs.');
      songIds.add(song.id);
    }
    for (const key of ['album', 'genre', 'mood', 'language', 'year', 'key'] as const) {
      if (source[key] != null) song[key] = text(source[key], `Song ${key}`);
    }
    if (source.favorite != null) {
      if (typeof source.favorite !== 'boolean') throw new Error('Favorite must be true or false.');
      song.favorite = source.favorite;
    }
    if (source.createdAt != null) song.createdAt = integer(source.createdAt, 'Song creation date');
    const lyricsSource = validateLyricsProvenance(source.lyricsSource);
    if (lyricsSource) song.lyricsSource = lyricsSource;
    return song;
  });
  const collections = array(data.collections, 'Collections', 2000).map((value): Collection => {
    const source = record(value, 'Collection');
    const collection: Collection = { name: text(source.name, 'Collection name') };
    if (source.id != null) {
      collection.id = integer(source.id, 'Collection ID', 1);
      if (collectionIds.has(collection.id)) throw new Error('Backup contains duplicate collection IDs.');
      collectionIds.add(collection.id);
    }
    if (source.createdAt != null) collection.createdAt = integer(source.createdAt, 'Collection creation date');
    return collection;
  });
  const links = array(data.links, 'Collection memberships', 100000).map((value) => {
    const source = record(value, 'Collection membership');
    const link = {
      collection_id: integer(source.collection_id, 'Collection membership ID', 1),
      song_id: integer(source.song_id, 'Song membership ID', 1),
    };
    if (!songIds.has(link.song_id) || !collectionIds.has(link.collection_id)) {
      throw new Error('A collection membership refers to a missing song or collection.');
    }
    return link;
  });
  return {
    version: data.version,
    ...(data.exportedAt == null ? {} : { exportedAt: integer(data.exportedAt, 'Export date') }),
    songs,
    collections,
    links,
  };
}

// Only identical arrangements are reused. Same-name songs with different lyrics
// or chords remain separate, and source attribution is not treated as identity.
export function songContentKey(song: Song): string {
  const normalize = (value: string) => value.trim().normalize('NFKC').toLowerCase();
  return JSON.stringify([
    normalize(song.title), normalize(song.artist), normalize(song.album || ''),
    song.lines.map((line) => [line.text.replace(/\r\n?/g, '\n'), line.chord || '']),
  ]);
}
