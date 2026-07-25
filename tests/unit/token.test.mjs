import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../../api/_lib/token.mjs';

const SECRET = 'a'.repeat(64);
const EMAIL = 'reader@example.com';

test('a freshly signed token verifies', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires, token, SECRET), true);
});

test('signing twice for the same email and expiry is deterministic', () => {
  const a = signToken(EMAIL, SECRET, 1800000000);
  const b = signToken(EMAIL, SECRET, 1800000000);
  assert.equal(a.token, b.token);
});

test('a token for one email does not verify for another', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken('attacker@example.com', expires, token, SECRET), false);
});

test('a tampered token does not verify', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyToken(EMAIL, expires, tampered, SECRET), false);
});

test('a token signed with a different secret does not verify', () => {
  const { token, expires } = signToken(EMAIL, 'b'.repeat(64));
  assert.equal(verifyToken(EMAIL, expires, token, SECRET), false);
});

test('an expired token does not verify even with a valid signature', () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const { token } = signToken(EMAIL, SECRET, past);
  assert.equal(verifyToken(EMAIL, past, token, SECRET), false);
});

test('a token whose expiry was moved forward does not verify', () => {
  const { token, expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires + 86400, token, SECRET), false);
});

test('a malformed token is rejected rather than throwing', () => {
  const { expires } = signToken(EMAIL, SECRET);
  assert.equal(verifyToken(EMAIL, expires, 'not-base64!!', SECRET), false);
  assert.equal(verifyToken(EMAIL, expires, '', SECRET), false);
});

test('email comparison is case-insensitive and trimmed', () => {
  const { token, expires } = signToken('  Reader@Example.COM  ', SECRET);
  assert.equal(verifyToken('reader@example.com', expires, token, SECRET), true);
});

test('default expiry is about 48 hours out', () => {
  const { expires } = signToken(EMAIL, SECRET);
  const delta = expires - Math.floor(Date.now() / 1000);
  assert.ok(delta > 47 * 3600 && delta <= 48 * 3600, `delta was ${delta}`);
});
