import type { LyricsResult, SongResult } from '../types';
export function parseUltimateGuitarSearch(html: string): { results: SongResult[] };
export function parseUltimateGuitarText(content: string): Pick<LyricsResult, 'lines' | 'plainLyrics' | 'syncedLyrics'>;
export function parseUltimateGuitarPage(html: string, id: string): Omit<LyricsResult, 'match' | 'quality'>;
export function createUltimateGuitarProvider(options: { http: { request(url: string, options?: object): Promise<unknown> } }): {
  search(query: string, options?: { signal?: AbortSignal }): Promise<{ results: SongResult[] }>;
  getLyrics(id: string, options?: { signal?: AbortSignal }): Promise<Omit<LyricsResult, 'match' | 'quality'>>;
};
