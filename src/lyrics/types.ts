import type { SongMetadata } from '../songMetadata';
import type { SongLine } from '../db/Database';

export type ProviderId = 'genius' | 'lrclib' | 'youtubemusic' | 'lyricsovh' | 'synclrc' | 'betterlyrics' | 'songsterr' | 'ultimateguitar';
export interface SongResult {
  id: string;
  provider: ProviderId;
  title: string;
  artist: string;
  album: string | null;
  duration: number | null;
  url: string;
  instrumental: boolean | null;
  hasLyrics: boolean | null;
  metadata?: SongMetadata;
}
export interface Attribution { name: string; text?: string; url?: string }
export interface LyricsResult {
  song: SongResult;
  plainLyrics: string;
  syncedLyrics: string | null;
  lines?: SongLine[];
  attribution?: Attribution | null;
  match: { kind: 'same-recording' | 'same-song' };
  quality: { score: number; reason: string };
}
export interface ProviderCheck {
  provider: ProviderId;
  state: 'pending' | 'found' | 'unavailable' | 'failed';
  message?: string;
}
export interface DiscoveryResult {
  best: LyricsResult | null;
  sources: LyricsResult[];
  checks: ProviderCheck[];
}
export interface SearchOptions { signal?: AbortSignal }
export interface DiscoveryOptions extends SearchOptions { onProgress?: (check: ProviderCheck) => void }
