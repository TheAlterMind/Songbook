import { LyricsError } from './http.js';

const MAX_ATTEMPTS = 3;
const unavailable = () => new LyricsError('LYRICS_UNAVAILABLE', 'This provider has no verified lyrics for this song.', 404);
const invalidResponse = () => new LyricsError('INVALID_RESPONSE', 'The provider returned lyrics for a different or invalid song.');
const missing = error => ['LYRICS_UNAVAILABLE', 'NOT_FOUND'].includes(error?.code);

function metadata(value, upstream = false) {
  const fail = () => {
    throw upstream ? invalidResponse() : new LyricsError('INVALID_SELECTION', 'Select a song with a valid title and artist.', 400);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const text = (field, required = false, limit = 300) => {
    const raw = value[field];
    if (raw === undefined || raw === null) {
      if (required) fail();
      return null;
    }
    if (typeof raw !== 'string' || raw.length > limit || /[\u0000-\u001f\u007f]/u.test(raw)) fail();
    const result = raw.trim();
    if (required && !result) fail();
    return result || null;
  };
  const title = text('title', true);
  const artist = text('artist', true);
  const album = text('album');
  const id = text('id', upstream, 8192);
  const provider = text('provider', upstream, 40);
  const duration = value.duration ?? null;
  if (duration !== null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 86400)) fail();
  if (provider !== null && !/^[a-z][a-z0-9]{0,39}$/.test(provider)) fail();
  if (!normalize(title) || !normalize(artist)) fail();
  return { title, artist, album, id, provider, duration, instrumental: value.instrumental === true, hasLyrics: value.hasLyrics };
}

// Preserve words and version labels. Punctuation/case differences do not change
// a song identity; a narrowly defined trailing remaster label may change release.
function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\u0027\u2018\u2019]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function titleKey(value) {
  return normalize(value.replace(/\s*(?:\((?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\)|\[(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\]|\s[-\u2013\u2014]\s(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?)\s*$/iu, ''));
}
function albumVersion(album) {
  if (!album) return '';
  const markers = [];
  const descriptorStart = String.raw`(?:[\[(]\s*|\s[-\u2013\u2014]\s+)`;
  // A version descriptor is meaningful; a studio title such as "Live Through
  // This" is not evidence of a live recording merely because of its first word.
  if (/^live(?:\s+\d{4})?\s*$/iu.test(album) || /^live\s+\d{4}\b/iu.test(album) || /\blive\s+(?:at|in|from|on)\b/iu.test(album)
      || new RegExp(`${descriptorStart}live\\b`, 'iu').test(album)) markers.push('live');
  for (const marker of ['acoustic', 'unplugged', 'karaoke', 'instrumental', 'sped up', 'slowed', 'nightcore']) {
    if (new RegExp(`(?:^|${descriptorStart})${marker}\\b`, 'iu').test(album)) markers.push(marker);
  }
  return markers.sort().join('|');
}
function titleVersions(title) {
  const versions = new Set();
  const markers = ['live', 'acoustic', 'unplugged', 'karaoke', 'instrumental', 'sped up', 'slowed', 'nightcore'];
  // Only explicit version labels count. A title such as "Live Through This"
  // or a parenthetical subtitle containing "live" is not version evidence.
  const labels = title.matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]|\s[-\u2013\u2014]\s(.+)$/gu);
  for (const match of labels) {
    let remaining = normalize(match[1] ?? match[2] ?? match[3]);
    const found = [];
    for (const marker of markers) {
      const expression = new RegExp(`\\b${marker}\\b`, 'gu');
      if (expression.test(remaining)) {
        found.push(marker === 'unplugged' ? 'acoustic' : marker);
        remaining = remaining.replace(expression, ' ');
      }
    }
    remaining = remaining.replace(/\b(?:version|recording|performance|session)\b/gu, ' ').trim();
    if (!remaining) for (const marker of found) versions.add(marker);
  }
  return versions;
}
function compatibleAlbumVersions(selection, song) {
  const selectedVersion = albumVersion(selection.album);
  const returnedVersion = albumVersion(song.album);
  if (selectedVersion === returnedVersion) return true;
  if (selection.album && song.album) return false;
  // Search responses may omit an album that the detail response supplies.
  // An unchanged provider ID is positive recording identity, not a conflict.
  if (selection.provider && selection.provider === song.provider && selection.id && selection.id === song.id) return true;
  // Across providers, a missing album alone cannot identify a live recording.
  // Require the unchanged title to explicitly support every known version
  // marker, e.g. "(Acoustic Live)" supports an "Unplugged (Live)" release.
  const versions = titleVersions(selection.title);
  return (selectedVersion || returnedVersion).split('|')
    .every(marker => versions.has(marker === 'unplugged' ? 'acoustic' : marker));
}
function sameSong(selection, song) {
  if (titleKey(selection.title) !== titleKey(song.title) || normalize(selection.artist) !== normalize(song.artist)) return false;
  if (!compatibleAlbumVersions(selection, song)) return false;
  if (selection.duration !== null && song.duration !== null) {
    const tolerance = Math.min(15, Math.max(8, selection.duration * 0.02));
    if (Math.abs(selection.duration - song.duration) > tolerance) return false;
  }
  return true;
}
// A chord chart often describes the composition rather than a particular live
// recording. Only a known arrangement provider may relax these explicit labels;
// discovery must then corroborate its lyrics before presenting the arrangement.
function arrangementTitle(title) {
  return title.replace(/\s*(?:\((?:(?:acoustic|live|unplugged|version)\s*)+\)|\[(?:(?:acoustic|live|unplugged|version)\s*)+\]|\s[-\u2013\u2014]\s(?:(?:acoustic|live|unplugged|version)\s*)+)\s*$/iu, '').trim();
}
function sameArrangement(selection, song, provider) {
  if (!['songsterr', 'ultimateguitar'].includes(provider) || normalize(selection.artist) !== normalize(song.artist)) return false;
  const selected = arrangementTitle(selection.title);
  let candidate = arrangementTitle(song.title);
  // Songsterr sometimes appends the literal "Acoustic" without parentheses.
  if (selected !== selection.title) candidate = candidate.replace(/\s+acoustic$/iu, '');
  return titleKey(selected) === titleKey(candidate);
}
function sameAlbum(a, b) {
  return Boolean(a.album && b.album && normalize(a.album) === normalize(b.album));
}
function rank(selection, song) {
  let score = sameAlbum(selection, song) ? 100 : 0;
  if (normalize(selection.title) === normalize(song.title)) score += 20;
  if (selection.duration !== null && song.duration !== null) score += 40 - Math.abs(selection.duration - song.duration);
  if (song.hasLyrics === true) score += 10;
  return score;
}
function hasText(result) {
  const meaningful = text => {
    if (typeof text !== 'string') return false;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const placeholder = /^(?:instrumental|\[instrumental\]|\(instrumental\)|no lyrics(?: (?:are )?available)?|lyrics (?:are )?(?:unavailable|not available|not found))(?: for this (?:song|track|recording))?[.!]?$/iu;
    return lines.some(line => !placeholder.test(line));
  };
  if (meaningful(result.plainLyrics)) return true;
  if (typeof result.syncedLyrics !== 'string') return false;
  return meaningful(result.syncedLyrics.split('\n')
    .filter(line => !/^\s*\[(?:ar|al|ti|au|by|offset|re|ve|length):/iu.test(line))
    .map(line => line.replace(/\[\d+:\d{2}(?:[.:]\d+)?\]|<\d+:\d{2}(?:[.:]\d+)?>/gu, '').trim())
    .join('\n'));
}
function queryFor(song) {
  // Keep both identity fields in a bounded query even for unusually long names.
  const artist = song.artist.slice(0, Math.min(song.artist.length, 100));
  return `${song.title.slice(0, 199 - artist.length).trim()} ${artist}`;
}

export function createProviderLookup({ search, getLyrics }) {
  return async function findLyrics(value, provider) {
    const selection = metadata(value);
    if (selection.instrumental) throw unavailable();
    let attempts = 0;
    let unresolvedFailure = null;
    const visited = new Set();
    const attempt = async candidate => {
      if (visited.has(candidate.id) || candidate.instrumental || candidate.hasLyrics === false || attempts >= MAX_ATTEMPTS) return null;
      visited.add(candidate.id);
      attempts += 1;
      let result;
      try { result = await getLyrics(provider, candidate.id); }
      catch (error) {
        if (missing(error)) return null;
        // A missing container could mean a challenge or a changed layout. Other
        // candidates may work, but exhaustion must not claim definite absence.
        if (error?.code === 'EXTRACTION_FAILED') {
          unresolvedFailure ??= error;
          return null;
        }
        throw error;
      }
      const song = metadata(result?.song, true);
      const strictMatch = sameSong(selection, song);
      if (song.provider !== provider || song.id !== candidate.id || (!strictMatch && !sameArrangement(selection, song, provider)) || !sameSong(candidate, song)) throw invalidResponse();
      if (song.instrumental || song.hasLyrics === false || !hasText(result)) return null;
      const exactSelection = selection.provider === provider && selection.id === song.id;
      const matchingRecording = sameAlbum(selection, song) && selection.duration !== null && song.duration !== null
        && Math.abs(selection.duration - song.duration) <= 3 && normalize(selection.title) === normalize(song.title);
      return { ...result, song: { ...result.song, hasLyrics: true }, match: { kind: exactSelection || matchingRecording ? 'same-recording' : 'same-song', ...(!strictMatch ? { requiresLyricsAgreement: true } : {}) } };
    };

    if (selection.provider === provider && selection.id) {
      const result = await attempt(selection);
      if (result) return result;
    }
    let response;
    try { response = await search(queryFor(['songsterr', 'ultimateguitar'].includes(provider) ? { ...selection, title: arrangementTitle(selection.title) } : selection), provider, { verifyLyrics: false }); }
    catch (error) {
      if (missing(error)) throw unresolvedFailure || unavailable();
      throw error;
    }
    if (!Array.isArray(response?.results)) throw invalidResponse();
    const candidates = response.results.slice(0, 100).map(value => metadata(value, true));
    if (candidates.some(song => song.provider !== provider)) throw invalidResponse();
    const matching = candidates.filter(song => (sameSong(selection, song) || sameArrangement(selection, song, provider)) && !song.instrumental && song.hasLyrics !== false)
      .sort((a, b) => rank(selection, b) - rank(selection, a));
    for (const song of matching) {
      if (attempts >= MAX_ATTEMPTS) break;
      const result = await attempt(song);
      if (result) return result;
    }
    throw unresolvedFailure || unavailable();
  };
}
