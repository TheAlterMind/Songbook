import { createLyricsService, plainFromLrc } from './lyrics.js';
import { HttpClient, LyricsError, abortError, throwIfAborted } from './http.js';

export const PROVIDERS = Object.freeze([
  { id: 'genius', name: 'Genius' },
  { id: 'lrclib', name: 'LRCLIB' },
  { id: 'youtubemusic', name: 'YouTube Music' },
  { id: 'lyricsovh', name: 'Lyrics.ovh' },
  { id: 'synclrc', name: 'SyncLRC' },
  { id: 'betterlyrics', name: 'Better Lyrics' },
].map(Object.freeze));
const tieOrder = ['genius', 'lrclib', 'youtubemusic', 'synclrc', 'betterlyrics', 'lyricsovh'];
const absent = new Set(['NOT_FOUND', 'LYRICS_UNAVAILABLE', 'NO_MATCH']);

async function boundedOperation(parent, timeoutMs, operation) {
  throwIfAborted(parent);
  const controller = new AbortController();
  let timedOut = false;
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const cancel = () => { controller.abort(); rejectCancellation(abortError()); };
  parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectCancellation(new LyricsError('TIMEOUT', 'This provider took too long to respond. Try again.', 504));
  }, timeoutMs);
  try {
    const result = await Promise.race([operation(controller.signal), cancelled]);
    throwIfAborted(parent);
    return result;
  } catch (error) {
    throwIfAborted(parent);
    if (timedOut) throw new LyricsError('TIMEOUT', 'This provider took too long to respond. Try again.', 504);
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}

// These are bounded presentation heuristics, not proof of correctness. Identity
// is checked by provider-lookup first; more characters never automatically win.
function prepareResult(result) {
  const plain = (typeof result.plainLyrics === 'string' ? result.plainLyrics :
    typeof result.syncedLyrics === 'string' ? plainFromLrc(result.syncedLyrics) : '')?.replace(/\r\n?/g, '\n').trim();
  if (!plain) return null;
  const nonempty = plain.split('\n').map(line => line.trim()).filter(Boolean);
  const placeholders = /^(?:\[?instrumental\]?|\(?instrumental\)?|no lyrics(?: (?:are )?available)?|lyrics (?:are )?(?:unavailable|not available|not found)|access denied|please enable javascript|verify (?:that )?you are human)[.!]?$/iu;
  if (nonempty.every(line => placeholders.test(line))) return null;
  const content = nonempty.filter(line => !/^\[[^\]]{1,80}\]$/.test(line) && /\p{L}/u.test(line));
  if (!content.length) return null;
  const unique = new Set(content.map(line => line.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));
  const hasStanzas = /\n\s*\n/.test(plain);
  const hasSections = nonempty.some(line => /^\[(?:verse|chorus|bridge|intro|outro|refrain|hook)\b[^\]]*\]$/iu.test(line));
  const mostlyReadable = content.filter(line => line.length <= 200).length / content.length >= 0.8;
  const quality = Math.min(unique.size, 12) * 2 + (hasStanzas ? 8 : 0) + (hasSections ? 6 : 0) + (mostlyReadable ? 8 : 0);
  const exact = result.match?.kind === 'same-recording';
  const reason = `${exact ? 'Exact recording match' : 'Same title and artist; recording may differ'}${hasStanzas || hasSections ? '; clear verse formatting' : mostlyReadable ? '; readable lyric lines' : ''}.`;
  return {
    ...result,
    plainLyrics: plain,
    syncedLyrics: typeof result.syncedLyrics === 'string' && result.syncedLyrics.trim() ? result.syncedLyrics : null,
    match: { kind: exact ? 'same-recording' : 'same-song' },
    // Identity already passed the strict matcher. A small recording preference
    // must not force Genius to win merely because its search omits duration.
    quality: { score: (exact ? 4 : 0) + quality, reason },
  };
}
function compare(a, b) {
  return b.quality.score - a.quality.score || tieOrder.indexOf(a.song.provider) - tieOrder.indexOf(b.song.provider);
}

export function createDeviceLyricsService({ fetchImpl, geniusToken = '', intervalMs = 300,
  requestTimeoutMs = 12000, providerTimeoutMs = 30000, serviceFactory = createLyricsService } = {}) {
  const http = new HttpClient({ fetchImpl, intervalMs, timeoutMs: requestTimeoutMs });
  const serviceFor = signal => serviceFactory({ http: http.withSignal(signal), geniusToken });
  return {
    async searchSongs(query, { signal } = {}) {
      return boundedOperation(signal, providerTimeoutMs, async innerSignal => {
        const result = await serviceFor(innerSignal).search(query, 'genius');
        throwIfAborted(innerSignal);
        return result.results;
      });
    },
    async findLyrics(song, { signal, onProgress } = {}) {
      throwIfAborted(signal);
      const checks = new Map(PROVIDERS.map(({ id }) => [id, { provider: id, state: 'pending' }]));
      const sources = [];
      const emit = check => {
        if (signal?.aborted) return;
        checks.set(check.provider, check);
        onProgress?.({ ...check });
      };
      for (const check of checks.values()) emit(check);
      const queue = PROVIDERS.map(({ id }) => id);
      const run = async () => {
        while (queue.length) {
          throwIfAborted(signal);
          const provider = queue.shift();
          try {
            const raw = await boundedOperation(signal, providerTimeoutMs,
              innerSignal => serviceFor(innerSignal).findLyrics({ ...song }, provider));
            throwIfAborted(signal);
            const lyrics = prepareResult(raw);
            if (!lyrics) { emit({ provider, state: 'unavailable' }); continue; }
            sources.push(lyrics);
            emit({ provider, state: 'found' });
          } catch (error) {
            throwIfAborted(signal);
            if (error.name === 'AbortError') throw error;
            emit({ provider, state: absent.has(error.code) ? 'unavailable' : 'failed', message: error.message || 'This provider could not be checked.' });
          }
        }
      };
      await Promise.all(Array.from({ length: 3 }, run));
      throwIfAborted(signal);
      sources.sort(compare);
      return { best: sources[0] || null, sources, checks: [...checks.values()] };
    },
  };
}
