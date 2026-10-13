import { fetch as nativeFetch } from 'expo/fetch';
import { GENIUS_ACCESS_TOKEN } from './appToken';
import { createDeviceLyricsService } from './core/discovery';

// Native networking is injected here; the core has no Expo/Node dependency and
// never reads credentials from logs, public environment variables, or storage.
const service = createDeviceLyricsService({
  fetchImpl: (url, init) => nativeFetch(url, init),
  geniusToken: GENIUS_ACCESS_TOKEN,
});
export const searchSongs = service.searchSongs;
export const findLyrics = service.findLyrics;
export { PROVIDERS } from './core/discovery';
export type * from './types';
