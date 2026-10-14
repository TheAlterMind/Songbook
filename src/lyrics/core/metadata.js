// Optional source facts are bounded and sanitized independently of the song's
// required identity. A malformed picture or credit must not discard good lyrics.
const string = (value, max = 300) => typeof value === 'string' && value.trim() && value.trim().length <= max
  ? value.trim() : undefined;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  ? value : undefined;

export function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const metadata = {};
  for (const field of ['key', 'timeSignature', 'album', 'genre', 'language', 'difficulty', 'recording']) {
    const cleaned = string(value[field]);
    if (cleaned) metadata[field] = cleaned;
  }
  for (const [field, min, max] of [['capo', 0, 24], ['tempo', 1, 500], ['duration', 0, 86400], ['year', 1000, 9999]]) {
    const cleaned = number(value[field], min, max);
    if (cleaned !== undefined && (!['capo', 'year'].includes(field) || Number.isInteger(cleaned))) metadata[field] = cleaned;
  }
  if (Array.isArray(value.tuning) && value.tuning.length > 0 && value.tuning.length <= 12 &&
      value.tuning.every(note => typeof note === 'string' && /^[A-G][#b♯♭]?[0-9]?$/.test(note))) metadata.tuning = [...value.tuning];
  const artworkUrl = httpsUrl(value.artworkUrl);
  if (artworkUrl) metadata.artworkUrl = artworkUrl;
  if (typeof value.releaseDate === 'string' && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value.releaseDate)) {
    const [year, month, day] = value.releaseDate.split('-').map(Number);
    if (year >= 1000 && year <= 9999 && (month === undefined || month >= 1 && month <= 12) &&
        (day === undefined || day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate())) metadata.releaseDate = value.releaseDate;
  }
  if (Array.isArray(value.mediaLinks)) {
    const seen = new Set();
    const links = value.mediaLinks.slice(0, 30).flatMap(link => {
      const url = httpsUrl(link?.url);
      const kind = string(link?.kind, 60);
      if (!url || !kind || seen.has(url)) return [];
      seen.add(url);
      const label = string(link.label);
      return [{ kind, ...(label ? { label } : {}), url }];
    });
    if (links.length) metadata.mediaLinks = links;
  }
  if (Array.isArray(value.credits)) {
    const seen = new Set();
    const credits = value.credits.slice(0, 100).flatMap(credit => {
      const role = string(credit?.role, 100);
      const name = string(credit?.name);
      const id = `${role}\n${name}`;
      if (!role || !name || seen.has(id)) return [];
      seen.add(id);
      return [{ role, name }];
    });
    if (credits.length) metadata.credits = credits;
  }
  return Object.keys(metadata).length ? metadata : undefined;
}

export function geniusMetadata(data) {
  const credits = [];
  for (const [field, role] of [['primary_artists', 'Artist'], ['featured_artists', 'Featured artist'],
    ['writer_artists', 'Writer'], ['producer_artists', 'Producer']]) {
    for (const person of Array.isArray(data[field]) ? data[field] : []) credits.push({ role, name: person?.name });
  }
  for (const performance of Array.isArray(data.custom_performances) ? data.custom_performances : []) {
    for (const person of Array.isArray(performance?.artists) ? performance.artists : []) {
      credits.push({ role: performance.label, name: person?.name });
    }
  }
  const mediaLinks = (Array.isArray(data.media) ? data.media : []).map(media => ({
    kind: string(media?.type, 60) || 'media', label: string(media?.provider), url: media?.url,
  }));
  if (data.apple_music_player_url) mediaLinks.push({ kind: 'audio', label: 'Apple Music', url: data.apple_music_player_url });
  const metadata = sanitizeMetadata({ album: data.album?.name,
    artworkUrl: httpsUrl(data.album?.cover_art_url) || httpsUrl(data.song_art_image_url) || httpsUrl(data.header_image_url),
    releaseDate: data.release_date, language: data.language, mediaLinks, credits,
  });
  if (metadata?.releaseDate) metadata.year = Number(metadata.releaseDate.slice(0, 4));
  return metadata;
}

// Deezer's public suggestion response still uses http links. These exact
// service domains also serve the same paths through HTTPS; do not rewrite
// arbitrary third-party URLs supplied by a response.
export function deezerHttpsUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && !url.username && !url.password && !url.port &&
      ['www.deezer.com', 'deezer.com', 'api.deezer.com', 'cdn-images.dzcdn.net', 'cdnt-preview.dzcdn.net'].includes(url.hostname)) {
      url.protocol = 'https:';
    }
    return httpsUrl(url.href);
  } catch { return undefined; }
}

export function deezerMetadata(data) {
  return sanitizeMetadata({ album: data.album?.title, duration: data.duration,
    recording: data.title_version,
    artworkUrl: deezerHttpsUrl(data.album?.cover_xl) || deezerHttpsUrl(data.album?.cover_big) ||
      deezerHttpsUrl(data.album?.cover_medium) || deezerHttpsUrl(data.album?.cover),
    releaseDate: data.release_date,
    mediaLinks: [
      { kind: 'audio', label: 'Deezer', url: deezerHttpsUrl(data.link) },
      { kind: 'preview', label: 'Deezer preview', url: deezerHttpsUrl(data.preview) },
    ],
  });
}

export function thumbnailUrl(thumbnails) {
  if (!Array.isArray(thumbnails)) return undefined;
  return thumbnails.map(item => ({ url: httpsUrl(item?.url), width: number(item?.width, 0, 10000) || 0 }))
    .filter(item => item.url).sort((a, b) => b.width - a.width)[0]?.url;
}
