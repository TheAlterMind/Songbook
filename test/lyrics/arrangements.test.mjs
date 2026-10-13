import test from 'node:test';
import assert from 'node:assert/strict';
import { hasChordArrangement, lyricsAgree } from '../../src/lyrics/core/arrangements.js';

const lyric = 'Synthetic morning paper boats\nCross a silver mountain lake\nWe carry twelve blue lanterns\nThrough the valley after rain';
test('validates chord positions against the chart’s own text', () => {
  const chart = { plainLyrics: lyric, lines: lyric.split('\n').map(text => ({ text, chords: [{ offset: 0, symbol: 'C/G' }] })) };
  assert.equal(hasChordArrangement(chart), true);
  assert.equal(hasChordArrangement({ ...chart, plainLyrics: lyric + ' different' }), false);
  assert.equal(hasChordArrangement({ ...chart, lines: chart.lines.map(line => ({ ...line, chords: [{ offset: 900, symbol: 'C' }] })) }), false);
  assert.equal(hasChordArrangement({ plainLyrics: lyric }), false);
});
test('corroboration tolerates repeated choruses and punctuation but not unrelated or partial text', () => {
  assert.equal(lyricsAgree(lyric, lyric + '\n' + lyric), true);
  assert.equal(lyricsAgree(lyric, '[Verse]\n' + lyric.toUpperCase().replaceAll(' ', ', ')), true);
  assert.equal(lyricsAgree(lyric, 'Entirely unrelated winter story written with no overlapping vocabulary here today'), false);
  assert.equal(lyricsAgree(lyric.split('\n')[0], lyric), false);
  assert.equal(lyricsAgree(lyric.split(/\s+/).reverse().join(' '), lyric), false);
});
