import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingEnv, requireEnv, MissingEnvError } from '../../api/_lib/env.mjs';

const NAMES = ['RESEND_API_KEY', 'RESEND_SEGMENT_ID', 'NEWSLETTER_FROM'];

test('nothing missing when all are set', () => {
  const env = { RESEND_API_KEY: 'k', RESEND_SEGMENT_ID: 's', NEWSLETTER_FROM: 'f' };
  assert.deepEqual(missingEnv(NAMES, env), []);
});

test('reports every missing name, not just the first', () => {
  // The whole point: configuring a deployment should not be a
  // fix-one / redeploy / discover-the-next loop.
  assert.deepEqual(missingEnv(NAMES, {}), NAMES);
});

test('reports the subset that is missing', () => {
  const env = { RESEND_API_KEY: 'k' };
  assert.deepEqual(missingEnv(NAMES, env), ['RESEND_SEGMENT_ID', 'NEWSLETTER_FROM']);
});

test('an empty or whitespace value counts as missing', () => {
  const env = { RESEND_API_KEY: '', RESEND_SEGMENT_ID: '   ', NEWSLETTER_FROM: 'f' };
  assert.deepEqual(missingEnv(NAMES, env), ['RESEND_API_KEY', 'RESEND_SEGMENT_ID']);
});

test('requireEnv returns the values when all are present', () => {
  const env = { RESEND_API_KEY: 'k', RESEND_SEGMENT_ID: 's', NEWSLETTER_FROM: 'f' };
  assert.deepEqual(requireEnv(NAMES, env), env);
});

test('requireEnv throws listing every missing name', () => {
  assert.throws(
    () => requireEnv(NAMES, { RESEND_API_KEY: 'k' }),
    (err) => {
      assert.ok(err instanceof MissingEnvError);
      assert.deepEqual(err.missing, ['RESEND_SEGMENT_ID', 'NEWSLETTER_FROM']);
      assert.match(err.message, /RESEND_SEGMENT_ID, NEWSLETTER_FROM/);
      return true;
    },
  );
});

test('the error never contains a value', () => {
  const secret = 'super-secret-value';
  try {
    requireEnv(NAMES, { RESEND_API_KEY: secret });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(!err.message.includes(secret));
    assert.ok(!JSON.stringify(err.missing).includes(secret));
  }
});
