import { Song } from '../db/Database';

export const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Title', value: 'title' },
  { label: 'Artist', value: 'artist' },
  { label: 'Year', value: 'year' },
  { label: 'Genre', value: 'genre' },
  { label: 'Key', value: 'key' },
  { label: 'Mood', value: 'mood' },
  { label: 'Favorites', value: 'favorite' },
];

export function sortSongs(songs: Song[], sortBy: string, dir: 'asc' | 'desc'): Song[] {
  const mul = dir === 'desc' ? -1 : 1;
  const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === '';

  return songs.slice().sort((a, b) => {
    if (sortBy === 'favorite') {
      const r = (a.favorite ? 1 : 0) - (b.favorite ? 1 : 0);
      return r !== 0 ? -r * mul : a.title.localeCompare(b.title);
    }
    const av = (a as any)[sortBy];
    const bv = (b as any)[sortBy];
    const aBlank = isBlank(av);
    const bBlank = isBlank(bv);
    if (aBlank && bBlank) return a.title.localeCompare(b.title);
    if (aBlank) return 1;
    if (bBlank) return -1;
    if (sortBy === 'year') return (Number(av) - Number(bv)) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
}
