// Builds the metronome's sound as a WAV file in memory: a few seconds of clicks at exact beat positions, with a
// higher click on the first beat of each bar. The phone loops the file, which keeps the beats evenly spaced
// without relying on JavaScript timers.

const SAMPLE_RATE = 44100;

/** The clicks for `bars` whole bars at `bpm`, as 16-bit mono PCM in a WAV container. */
export function makeClickWav(bpm: number, beatsPerBar: number, seconds = 20): Uint8Array {
  const beatSamples = (SAMPLE_RATE * 60) / bpm;
  const bars = Math.max(1, Math.round((seconds * bpm) / 60 / beatsPerBar));
  const totalBeats = bars * beatsPerBar;
  // A whole number of beats, so that when the file loops the spacing carries on unchanged.
  const total = Math.round(totalBeats * beatSamples);

  const pcm = new Int16Array(total);
  const clickLength = Math.round(SAMPLE_RATE * 0.045);
  for (let beat = 0; beat < totalBeats; beat++) {
    const start = Math.round(beat * beatSamples);
    const accent = beat % beatsPerBar === 0;
    const frequency = accent ? 1700 : 1050;
    const gain = accent ? 0.95 : 0.72;
    const length = Math.min(clickLength, total - start);
    for (let n = 0; n < length; n++) {
      const envelope = Math.exp(-n / (SAMPLE_RATE * 0.009));
      const value = Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE) * envelope * gain;
      pcm[start + n] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
  }

  const dataBytes = total * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < total; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return out;
}
