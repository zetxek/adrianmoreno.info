import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, recordSent } from '../../scripts/newsletter/state.mjs';

function tmpFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'nlstate-'));
  const file = join(dir, '.newsletter-state.json');
  if (contents !== undefined) writeFileSync(file, contents);
  return file;
}

test('reads an existing state file', () => {
  assert.deepEqual(readState(tmpFile('{"sent":["a","b"]}')), ['a', 'b']);
});

test('a missing file reads as empty rather than throwing', () => {
  assert.deepEqual(readState(tmpFile(undefined)), []);
});

test('a corrupt file reads as empty rather than throwing', () => {
  assert.deepEqual(readState(tmpFile('{not json')), []);
});

test('a file missing the sent key reads as empty', () => {
  assert.deepEqual(readState(tmpFile('{}')), []);
});

test('recordSent appends and persists', () => {
  const file = tmpFile('{"sent":["a"]}');
  recordSent(file, 'b');
  assert.deepEqual(readState(file), ['a', 'b']);
  assert.match(readFileSync(file, 'utf8'), /\n$/, 'file should end with a newline');
});

test('recordSent is idempotent for a slug already present', () => {
  const file = tmpFile('{"sent":["a"]}');
  recordSent(file, 'a');
  assert.deepEqual(readState(file), ['a']);
});

test('recordSent creates the file when it does not exist', () => {
  const file = tmpFile(undefined);
  recordSent(file, 'first');
  assert.deepEqual(readState(file), ['first']);
});
