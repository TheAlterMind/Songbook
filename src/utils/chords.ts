import type { SongLine } from '../db/Database';

// Diff-based reconciliation: finds the common prefix and suffix between the old
// and new line arrays. Only the "changed" region in between is ambiguous; chords
// in the prefix/suffix regions are preserved exactly (shifted by the line-count
// delta if they're in the suffix), so inserting/deleting lines elsewhere never
// touches chords that weren't actually affected. This is what keeps a single
// free-flowing Lyrics field safe to edit even after chords are attached.
export function reconcileChordRows(
  oldLines: string[],
  newLines: string[],
  oldChordRows: Record<number, string>
): Record<number, string> {
  let prefix = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (prefix < minLen && oldLines[prefix] === newLines[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMidStart = prefix;
  const oldMidEnd = oldLines.length - suffix;
  const newMidLen = newLines.length - suffix - prefix;
  const oldMidLen = oldMidEnd - oldMidStart;
  const delta = newLines.length - oldLines.length;

  const newChordRows: Record<number, string> = {};
  Object.keys(oldChordRows).forEach((key) => {
    const oldIdx = Number(key);
    const chord = oldChordRows[oldIdx];
    if (oldIdx < oldMidStart) {
      newChordRows[oldIdx] = chord;
    } else if (oldIdx >= oldMidEnd) {
      newChordRows[oldIdx + delta] = chord;
    } else if (oldMidLen === newMidLen) {
      newChordRows[oldIdx] = chord;
    }
    // else: a line was inserted/removed right at this chorded line's position — ambiguous, dropped.
  });
  return newChordRows;
}

// ---------- chord sheets (Ultimate Guitar style: a chord line above each lyric line) ----------

const CHORD =
  /^\(?[A-H](?:#|b)?(?:maj|min|m|M|dim|aug|sus|add|\+|°|ø)?\d*(?:(?:maj|sus|add|b|#|\+|-)\d+)*(?:\/[A-H](?:#|b)?)?\)?$/;
// Tokens that may sit on a chord line without being chords.
const FILLER = /^(?:\||\|\||-+|x\d+|\d+x|\(x?\d+x?\)|N\.?C\.?|%|\/|\.\.\.?)$/i;

function isChordToken(t: string): boolean {
  return CHORD.test(t);
}

/** True when a line holds only chords (and bar symbols): at least one chord, nothing that reads as words. */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const t of tokens) {
    if (isChordToken(t)) chords++;
    else if (!FILLER.test(t)) return false;
  }
  return chords > 0;
}

/** Strips Ultimate Guitar markup: [ch]G[/ch] becomes G (keeping its column), [tab] blocks are unwrapped. */
export function stripUgMarkup(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?tab\]/g, '')
    .replace(/\[ch\]([^[]*?)\[\/ch\]/g, '$1');
}

/** Whether pasted or imported text looks like a chord sheet worth splitting. */
export function looksLikeChordSheet(text: string): boolean {
  const lines = stripUgMarkup(text).split('\n').filter((l) => l.trim());
  if (lines.length < 2) return false;
  const chordLines = lines.filter(isChordLine).length;
  return chordLines >= 2 && chordLines / lines.length >= 0.15;
}

/**
 * Splits a chord sheet into Songbook lines. A chord line followed by a lyric line becomes one line
 * with that chord row; a chord line with no lyric under it (intro, instrumental) becomes a line with
 * chords and no text. Leading spaces of chord rows are kept, so each chord stays over its word.
 */
export function parseChordSheet(text: string): SongLine[] {
  const src = stripUgMarkup(text).split('\n').map((l) => l.replace(/\s+$/, ''));
  // Drop leading and trailing blank lines.
  while (src.length && !src[0].trim()) src.shift();
  while (src.length && !src[src.length - 1].trim()) src.pop();

  const out: SongLine[] = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (isChordLine(line)) {
      const next = src[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !/^\s*\[.*\]\s*$/.test(next)) {
        out.push({ text: next, chord: line });
        i++;
      } else {
        out.push({ text: '', chord: line });
      }
    } else {
      out.push({ text: line, chord: '' });
    }
  }
  return out;
}
