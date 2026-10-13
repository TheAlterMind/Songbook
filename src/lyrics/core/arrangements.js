// Chord offsets refer to UTF-16 positions in the source's own lyric lines.
// Never transplant them onto text returned by another provider.
export function hasChordArrangement(result) {
  if (!Array.isArray(result?.lines) || !result.lines.length || result.lines.length > 20000) return false;
  if (result.lines.map(line => line?.text).join('\n').trim() !== result.plainLyrics?.trim()) return false;
  let chordCount = 0;
  for (const line of result.lines) {
    if (typeof line?.text !== 'string') return false;
    if (line.chords == null) continue;
    if (!Array.isArray(line.chords) || line.chords.length > 1000) return false;
    let last = -1;
    for (const chord of line.chords) {
      if (!Number.isSafeInteger(chord?.offset) || chord.offset < last || chord.offset > line.text.length || chord.offset < 0
        || typeof chord.symbol !== 'string' || !chord.symbol.trim() || chord.symbol.length > 80 || /[\r\n\u0000]/u.test(chord.symbol)) return false;
      if (chord.offset > 0 && /[\uD800-\uDBFF]/u.test(line.text[chord.offset - 1]) && /[\uDC00-\uDFFF]/u.test(line.text[chord.offset] || '')) return false;
      last = chord.offset;
      chordCount++;
    }
  }
  return chordCount > 0;
}

function lyricTokens(text) {
  return text.split('\n').filter(line => !/^\s*\[[^\]]*\]\s*$/u.test(line))
    .join(' ').normalize('NFKC').toLowerCase().replace(/[’']/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
}
export function lyricWordCount(text) { return new Set(lyricTokens(text)).size; }

// Unique words make repeated choruses optional, while requiring the chart to
// cover substantially the same lyric content in both directions. This verifies
// corresponding text, not a claim that a community transcription is musically exact.
export function lyricsAgree(chart, reference) {
  const chartTokens = lyricTokens(chart), referenceTokens = lyricTokens(reference);
  const a = new Set(chartTokens), b = new Set(referenceTokens);
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  if (common < 12 || common / a.size < 0.8 || common / b.size < 0.85) return false;
  const pairs = tokens => new Set(tokens.slice(0, -1).map((word, i) => `${word} ${tokens[i + 1]}`));
  const chartPairs = pairs(chartTokens), referencePairs = pairs(referenceTokens);
  let ordered = 0;
  for (const pair of chartPairs) if (referencePairs.has(pair)) ordered++;
  return ordered / chartPairs.size >= 0.65 && ordered / referencePairs.size >= 0.65;
}
