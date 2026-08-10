const NOTE_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

function transposeToken(token: string, steps: number): string {
  const m = token.match(/^([A-Ga-g])(#|b)?(.*)$/);
  if (!m) return token;
  let root = m[1].toUpperCase() + (m[2] || '');
  if (FLAT_TO_SHARP[root]) root = FLAT_TO_SHARP[root];
  const idx = NOTE_SCALE.indexOf(root);
  if (idx === -1) return token;
  return NOTE_SCALE[(idx + steps + 1200) % 12] + m[3];
}

export function transposeLine(line: string, steps: number): string {
  return line.replace(/[A-Ga-g][#b]?[^\s]*/g, (tok) => transposeToken(tok, steps));
}
