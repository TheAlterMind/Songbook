// Pitch detection and note maths for the tuner. Pure functions: no audio APIs, easy to test.

export type PitchResult = { frequency: number; clarity: number };

/**
 * Finds the fundamental frequency of a short mono signal with the YIN method: it looks for the lag at which the
 * signal best matches a shifted copy of itself, which is far less prone to octave mistakes than a plain
 * autocorrelation. `clarity` is 0..1 (how clean the match is). Returns null for silence or noise.
 * The buffer should hold at least two periods of the lowest note wanted, so 2048+ samples for a guitar.
 */
export function detectPitch(input: Float32Array, sampleRate: number, minFreq = 60, maxFreq = 1200): PitchResult | null {
  const size = input.length;
  const half = Math.floor(size / 2);
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minFreq));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (tauMax <= tauMin + 2) return null;

  // Too quiet to be a played note.
  let mean = 0;
  for (let i = 0; i < size; i++) mean += input[i];
  mean /= size;
  let energy = 0;
  for (let i = 0; i < size; i++) {
    const v = input[i] - mean;
    energy += v * v;
  }
  if (Math.sqrt(energy / size) < 0.008) return null;

  // Difference function, then its cumulative mean normalised version.
  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < half; j++) {
      const d = input[j] - input[j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  const cm = new Float32Array(tauMax + 1);
  cm[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cm[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }

  // The first dip below the threshold, followed down to its bottom.
  let best = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cm[t] < 0.15) {
      while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++;
      best = t;
      break;
    }
  }
  if (best < 0) {
    // No clear dip: take the deepest one if it is still reasonably clean.
    let deepest = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cm[t] < cm[deepest]) deepest = t;
    if (cm[deepest] > 0.35) return null;
    best = deepest;
  }

  // Parabolic interpolation around the dip for a sub-sample lag.
  let lag = best;
  if (best > 1 && best < tauMax) {
    const a = cm[best - 1];
    const b = cm[best];
    const c = cm[best + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) lag = best + (a - c) / (2 * denom);
  }
  return { frequency: sampleRate / lag, clarity: Math.max(0, Math.min(1, 1 - cm[best])) };
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export type NoteInfo = {
  name: string; // "A", "C♯"
  octave: number;
  /** How far the pitch is from the note, -50..+50 cents (100 cents = one semitone). Negative is flat. */
  cents: number;
  /** The exact frequency of the note itself. */
  target: number;
};

/** The nearest note to a frequency (equal temperament, A4 = 440 Hz by default). */
export function noteFromFrequency(frequency: number, a4 = 440): NoteInfo {
  const midi = 69 + 12 * Math.log2(frequency / a4);
  const nearest = Math.round(midi);
  return {
    name: NAMES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    cents: (midi - nearest) * 100,
    target: a4 * Math.pow(2, (nearest - 69) / 12),
  };
}

export type GuitarString = { label: string; name: string; octave: number; frequency: number };

/** Standard tuning, low to high. */
export const GUITAR_STRINGS: GuitarString[] = [
  { label: '6', name: 'E', octave: 2, frequency: 82.41 },
  { label: '5', name: 'A', octave: 2, frequency: 110.0 },
  { label: '4', name: 'D', octave: 3, frequency: 146.83 },
  { label: '3', name: 'G', octave: 3, frequency: 196.0 },
  { label: '2', name: 'B', octave: 3, frequency: 246.94 },
  { label: '1', name: 'E', octave: 4, frequency: 329.63 },
];

/** The guitar string nearest to a frequency, and how many cents the frequency is from it. */
export function nearestGuitarString(frequency: number): { string: GuitarString; cents: number } {
  let best = GUITAR_STRINGS[0];
  let bestAbs = Infinity;
  for (const s of GUITAR_STRINGS) {
    const cents = 1200 * Math.log2(frequency / s.frequency);
    if (Math.abs(cents) < bestAbs) {
      bestAbs = Math.abs(cents);
      best = s;
    }
  }
  return { string: best, cents: 1200 * Math.log2(frequency / best.frequency) };
}
