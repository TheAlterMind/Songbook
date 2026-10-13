import type { DiscoveryOptions, DiscoveryResult, ProviderId, SearchOptions, SongResult } from '../types';
export const PROVIDERS: readonly { readonly id: ProviderId; readonly name: string }[];
export function createDeviceLyricsService(options: {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  geniusToken: string;
  intervalMs?: number;
  requestTimeoutMs?: number;
  providerTimeoutMs?: number;
}): {
  searchSongs(query: string, options?: SearchOptions): Promise<SongResult[]>;
  findLyrics(song: SongResult, options?: DiscoveryOptions): Promise<DiscoveryResult>;
};
