import type { SongLine } from '../db/Database';
import type { ChordAnchor } from '../songMetadata';

export function lineHasChords(line: SongLine): boolean {
  return !!line.chords?.some((anchor) => anchor.symbol.trim()) || !!line.chord?.trim();
}

export function lineAnchors(line: SongLine): ChordAnchor[] {
  if (line.chords?.length) return line.chords;
  return [...(line.chord ?? '').matchAll(/\S+/g)].map((match) => ({
    offset: Math.min(match.index ?? 0, line.text.length), symbol: match[0],
  }));
}

// Each unit wraps as a pair: its chord stays above the exact text offset even
// when a chord is wider than its lyric, or a user changes the reading font size.
export function arrangementUnits(line: SongLine): { text: string; chord: string }[] {
  const at = new Map<number, string[]>();
  for (const anchor of lineAnchors(line)) {
    const offset = Math.max(0, Math.min(anchor.offset, line.text.length));
    at.set(offset, [...(at.get(offset) ?? []), anchor.symbol]);
  }
  const boundaries = new Set([0, line.text.length, ...at.keys()]);
  for (const word of line.text.matchAll(/\S+\s*|\s+/g)) {
    boundaries.add(word.index ?? 0);
    boundaries.add((word.index ?? 0) + word[0].length);
  }
  const positions = [...boundaries].sort((a, b) => a - b);
  const units = positions.slice(0, -1).map((position, index) => ({
    text: line.text.slice(position, positions[index + 1]),
    chord: (at.get(position) ?? []).join(' '),
  }));
  if (at.has(line.text.length)) units.push({ text: '', chord: at.get(line.text.length)!.join(' ') });
  return units;
}

// Only identical lyric lines retain their arrangement. LCS handles edits in
// several places; a bounded fallback avoids quadratic work for large pastes.
export function reconcileSongLines(previous: SongLine[], text: string): SongLine[] {
  const next = text.replace(/\r\n?/g, '\n').split('\n');
  const occurrences = new Map<string, { count: number; arrangement: string; differs: boolean }>();
  const nextOccurrences = new Map<string, number>();
  for (const line of previous) {
    const signature = JSON.stringify(lineAnchors(line).filter((anchor) => anchor.symbol.trim()).map((anchor) => ({ offset: anchor.offset, symbol: anchor.symbol.trim() })));
    const occurrence = occurrences.get(line.text);
    if (occurrence) { occurrence.count++; occurrence.differs ||= occurrence.arrangement !== signature; }
    else occurrences.set(line.text, { count: 1, arrangement: signature, differs: false });
  }
  for (const line of next) nextOccurrences.set(line, (nextOccurrences.get(line) ?? 0) + 1);
  const result = next.map((line): SongLine => ({ text: line }));
  let start = 0;
  while (start < Math.min(previous.length, next.length) && previous[start].text === next[start]) {
    result[start] = previous[start]; start++;
  }
  let oldEnd = previous.length; let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1].text === next[newEnd - 1]) {
    result[--newEnd] = previous[--oldEnd];
  }
  const oldCount = oldEnd - start; const newCount = newEnd - start;
  if (oldCount * newCount <= 250000) {
    const lengths = Array.from({ length: oldCount + 1 }, () => new Uint32Array(newCount + 1));
    for (let a = oldCount - 1; a >= 0; a--) for (let b = newCount - 1; b >= 0; b--) {
      lengths[a][b] = previous[start + a].text === next[start + b]
        ? lengths[a + 1][b + 1] + 1 : Math.max(lengths[a + 1][b], lengths[a][b + 1]);
    }
    let a = 0; let b = 0;
    while (a < oldCount && b < newCount) {
      if (previous[start + a].text === next[start + b]) { result[start + b] = previous[start + a]; a++; b++; }
      else if (lengths[a + 1][b] >= lengths[a][b + 1]) a++; else b++;
    }
  } else {
    const oldIndices = new Map<string, number[]>(); const newCounts = new Map<string, number>();
    for (let a = start; a < oldEnd; a++) oldIndices.set(previous[a].text, [...(oldIndices.get(previous[a].text) ?? []), a]);
    for (let b = start; b < newEnd; b++) newCounts.set(next[b], (newCounts.get(next[b]) ?? 0) + 1);
    let last = start - 1;
    for (let b = start; b < newEnd; b++) {
      const indices = oldIndices.get(next[b]);
      if (indices?.length === 1 && newCounts.get(next[b]) === 1 && indices[0] > last) {
        last = indices[0]; result[b] = previous[last];
      }
    }
  }
  // Text alone cannot tell which repeated chorus (or empty instrumental row)
  // was removed. Keep no guessed arrangement when those copies had different
  // chords. Identical copies remain safe to preserve.
  return result.map((line) => {
    const occurrence = occurrences.get(line.text);
    return occurrence?.differs && occurrence.count !== nextOccurrences.get(line.text) ? { text: line.text } : line;
  });
}
