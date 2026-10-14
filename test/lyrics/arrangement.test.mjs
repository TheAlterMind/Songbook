import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangementUnits, lineAnchors, reconcileSongLines } from '../../src/utils/arrangement.ts';
import { transposeChord, transposeSongLine, transposeLine, transposeKey } from '../../src/utils/transpose.ts';

test('word units retain exact lyric text and chord offsets including mid-word and Unicode', () => {
  const text = 'A 🪕 melody moves';
  const line = { text, chords: [{ offset: 0, symbol: 'C' }, { offset: 8, symbol: 'G/B' }, { offset: text.length, symbol: 'Am' }] };
  const units = arrangementUnits(line);
  assert.equal(units.map((unit) => unit.text).join(''), text);
  let offset = 0;
  const actual = [];
  for (const unit of units) { if (unit.chord) actual.push({ offset, symbol: unit.chord }); offset += unit.text.length; }
  assert.deepEqual(actual, line.chords);
});

test('instrumental rows render all chords sharing an empty-text anchor', () => {
  assert.deepEqual(arrangementUnits({ text: '', chords: [{ offset: 0, symbol: 'C' }, { offset: 0, symbol: 'F' }] }), [{ text: '', chord: 'C F' }]);
});

test('inserting and deleting lines retains unchanged arrangements', () => {
  const verse = { text: 'Synthetic verse', chords: [{ offset: 0, symbol: 'G' }] };
  const chorus = { text: 'Synthetic chorus', chord: '  D     A' };
  const result = reconcileSongLines([verse, { text: 'Remove me' }, chorus], 'New heading\nSynthetic verse\nSynthetic chorus');
  assert.equal(result[1], verse);
  assert.equal(result[2], chorus);
});

test('same-length text edits clear that line chords and preserve interior unchanged rows', () => {
  const middle = { text: 'Keep these words', chords: [{ offset: 5, symbol: 'Am' }] };
  const result = reconcileSongLines([{ text: 'Old first', chord: 'G' }, middle, { text: 'Old last', chord: 'D' }], 'New first\nKeep these words\nNew last');
  assert.deepEqual(result[0], { text: 'New first' });
  assert.equal(result[1], middle);
  assert.deepEqual(result[2], { text: 'New last' });
});

test('duplicate chorus rows retain the corresponding anchors when an intervening verse changes', () => {
  const a = { text: 'Repeat', chord: 'G' }; const b = { text: 'Repeat', chord: 'A' };
  assert.deepEqual(reconcileSongLines([a, { text: 'Verse' }, b], 'Repeat\nChanged verse\nRepeat'), [a, { text: 'Changed verse' }, b]);
});

test('deleting or inserting identical lyric rows clears conflicting ambiguous arrangements', () => {
  const first = { text: 'Repeat', chord: 'G' };
  const second = { text: 'Repeat', chords: [{ offset: 0, symbol: 'A' }] };
  assert.deepEqual(reconcileSongLines([first, second], 'Repeat'), [{ text: 'Repeat' }]);
  assert.deepEqual(reconcileSongLines([first, second], 'Repeat\nRepeat\nRepeat'), [{ text: 'Repeat' }, { text: 'Repeat' }, { text: 'Repeat' }]);
});

test('identical duplicate arrangements remain safe when their occurrence count changes', () => {
  const first = { text: 'Repeat', chord: 'G' };
  const second = { text: 'Repeat', chords: [{ offset: 0, symbol: 'G' }] };
  assert.deepEqual(reconcileSongLines([first, second], 'Repeat'), [first]);
});

test('ambiguous blank instrumental rows never inherit the wrong introduction or ending chords', () => {
  const previous = [{ text: '', chords: [{ offset: 0, symbol: 'G' }] }, { text: 'Verse' }, { text: '', chords: [{ offset: 0, symbol: 'A' }] }];
  assert.deepEqual(reconcileSongLines(previous, 'Verse\n'), [{ text: 'Verse' }, { text: '' }]);
});

test('legacy leading spaces remain chord positions', () => {
  assert.deepEqual(lineAnchors({ text: 'Some example words', chord: '  G      D' }), [{ offset: 2, symbol: 'G' }, { offset: 9, symbol: 'D' }]);
});

test('blank lyric rows with instrumental chords survive an unchanged import and save', () => {
  const lines = [{ text: '', chords: [{ offset: 0, symbol: 'G' }] }, { text: 'Synthetic lyric' }, { text: '', chords: [{ offset: 0, symbol: 'D' }] }];
  assert.deepEqual(reconcileSongLines(lines, lines.map((line) => line.text).join('\n')), lines);
});

test('keys transpose while preserving major and minor mode notation', () => {
  assert.equal(transposeKey('A minor', 1), 'A# minor');
  assert.equal(transposeKey('Db major', -1), 'C major');
  assert.equal(transposeKey('Gm', 2), 'Am');
  assert.equal(transposeKey('Unknown', 1), 'Unknown');
});

test('transposition changes root and slash bass but keeps qualities and no-chord markers', () => {
  assert.equal(transposeChord('Cmaj7/G', 1), 'C#maj7/G#');
  assert.equal(transposeChord('Bbmin7/Db', -2), 'G#min7/B');
  assert.equal(transposeChord('F♯sus4/C♯', -1), 'Fsus4/C');
  assert.equal(transposeChord('N.C.', 1), 'N.C.');
  assert.equal(transposeChord('C', -13), 'B');
  assert.equal(transposeLine('  C/G    Am7 ', 1), '  C#/G#    A#m7 ');
});

test('transposition preserves every anchor offset and upgrades legacy spacing before widths change', () => {
  const line = { text: 'Synthetic words here', chords: [{ offset: 1, symbol: 'C' }, { offset: 10, symbol: 'D/F#' }] };
  assert.deepEqual(transposeSongLine(line, 1), { text: line.text, chords: [{ offset: 1, symbol: 'C#' }, { offset: 10, symbol: 'D#/G' }] });
  assert.deepEqual(transposeSongLine({ text: line.text, chord: '  C      D/F#' }, 1), {
    text: line.text, chords: [{ offset: 2, symbol: 'C#' }, { offset: 9, symbol: 'D#/G' }],
  });
  assert.equal(line.chords[0].symbol, 'C');
});
