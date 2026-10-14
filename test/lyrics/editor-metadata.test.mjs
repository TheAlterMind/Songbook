import test from 'node:test';
import assert from 'node:assert/strict';
import { editedMetadata, importedMetadataFields } from '../../src/utils/editorMetadata.ts';

test('replacing an imported arrangement clears facts absent from its source', () => {
  const oldFields = importedMetadataFields({ key: 'G', year: 1993, album: 'First recording', genre: 'Rock', language: 'English' });
  const newFields = { ...oldFields, ...importedMetadataFields({ tuning: ['D', 'A', 'D', 'G', 'B', 'E'] }) };
  assert.deepEqual(newFields, { key: '', year: '', album: '', genre: '', language: '' });
});

test('a precise release date survives an unchanged year but never conflicts with a year edit', () => {
  const original = { year: 1993, releaseDate: '1993-06-12', album: 'Recording', key: 'G', capo: 2 };
  const fields = importedMetadataFields(original);
  assert.equal(editedMetadata(original, fields).releaseDate, '1993-06-12');
  const changed = editedMetadata(original, { ...fields, year: '2001' });
  assert.equal(changed.year, 2001);
  assert.equal(changed.releaseDate, undefined);
  assert.equal(changed.capo, 2);
  assert.equal(editedMetadata(original, { ...fields, year: '' }).releaseDate, undefined);
  assert.equal(original.releaseDate, '1993-06-12');
});

test('release-date-only imports populate their known year and retain it when saved', () => {
  const metadata = { releaseDate: '2020-01-23' };
  const fields = importedMetadataFields(metadata);
  assert.equal(fields.year, '2020');
  assert.equal(editedMetadata(metadata, fields).releaseDate, '2020-01-23');
});
