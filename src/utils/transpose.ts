import type { SongLine } from '../db/Database';
const NOTE_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_VALUES: Record<string, number> = { C: 0, 'B#': 0, Db: 1, D: 2, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11, Cb: 11 };

function transposeNote(note: string, steps: number): string {
  const normalized = note[0].toUpperCase() + note.slice(1).replace('♯', '#').replace('♭', 'b');
  const index = NOTE_VALUES[normalized] ?? NOTE_SCALE.indexOf(normalized);
  return index < 0 ? note : NOTE_SCALE[((index + steps) % 12 + 12) % 12];
}

export function transposeChord(symbol: string, steps: number): string {
  if (!Number.isInteger(steps) || steps % 12 === 0) return symbol;
  const match = symbol.match(/^([A-Ga-g][#b♯♭]?)(.*?)(?:\/([A-Ga-g][#b♯♭]?))?$/);
  if (!match || /\s/.test(symbol)) return symbol;
  return transposeNote(match[1], steps) + match[2] + (match[3] ? '/' + transposeNote(match[3], steps) : '');
}

export function transposeKey(key: string, steps: number): string {
  if (!Number.isInteger(steps) || steps % 12 === 0) return key;
  const match = key.match(/^(\s*)([A-Ga-g][#b♯♭]?)((?:\s*(?:major|minor|maj|min|m))?)(\s*)$/i);
  return match ? match[1] + transposeNote(match[2], steps) + match[3] + match[4] : key;
}

export function transposeLine(line: string, steps: number): string {
  return line.replace(/\S+/g, (token) => transposeChord(token, steps));
}

export function transposeSongLine(line: SongLine, steps: number): SongLine {
  if (line.chords?.length) return { ...line, chords: line.chords.map((anchor) => ({ ...anchor, symbol: transposeChord(anchor.symbol, steps) })) };
  if (!line.chord?.trim()) return line;
  // Move legacy columns into explicit anchors before changing symbol widths.
  const { chord, ...rest } = line;
  return { ...rest, chords: [...chord.matchAll(/\S+/g)].map((match) => ({
    offset: Math.min(match.index ?? 0, line.text.length), symbol: transposeChord(match[0], steps),
  })) };
}
