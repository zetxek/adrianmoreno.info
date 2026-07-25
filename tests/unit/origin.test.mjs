import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOrigin, isAllowedOrigin } from '../../api/_lib/origin.mjs';

const PROD = 'https://www.adrianmoreno.info';
const PREVIEW = 'https://adrianmoreno-info-git-branch-adrianmoreno.vercel.app';

test('production uses the canonical URL, never VERCEL_URL', () => {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'adrianmoreno-info-abc123.vercel.app',
    SITE_BASE_URL: PROD,
  };
  assert.equal(siteOrigin(env), PROD);
});

test('a preview deployment uses its own hostname', () => {
  const env = {
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'adrianmoreno-info-git-branch-adrianmoreno.vercel.app',
    SITE_BASE_URL: PROD,
  };
  assert.equal(siteOrigin(env), PREVIEW);
});

test('outside Vercel it falls back to SITE_BASE_URL', () => {
  assert.equal(siteOrigin({ SITE_BASE_URL: 'https://example.test' }), 'https://example.test');
});

test('with nothing configured it falls back to the canonical URL', () => {
  assert.equal(siteOrigin({}), PROD);
});

test('a preview without VERCEL_URL falls back rather than producing a broken origin', () => {
  assert.equal(siteOrigin({ VERCEL_ENV: 'preview', SITE_BASE_URL: PROD }), PROD);
});

test('a request with no Origin header is allowed', () => {
  assert.equal(isAllowedOrigin(undefined, PROD, {}), true);
});

test('the deployment own origin is allowed', () => {
  assert.equal(isAllowedOrigin(PREVIEW, PREVIEW, { SITE_BASE_URL: PROD }), true);
});

test('the canonical production origin is allowed even from a preview deployment', () => {
  assert.equal(isAllowedOrigin(PROD, PREVIEW, { SITE_BASE_URL: PROD }), true);
});

test('localhost is allowed for development', () => {
  assert.equal(isAllowedOrigin('http://localhost:1313', PROD, {}), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:1313', PROD, {}), true);
});

test('an unrelated origin is rejected', () => {
  assert.equal(isAllowedOrigin('https://evil.example', PROD, { SITE_BASE_URL: PROD }), false);
});

test('an origin merely prefixed by the site URL is rejected', () => {
  // Guards against the substring check this replaced, where
  // "https://www.adrianmoreno.info.evil.test" passed startsWith().
  assert.equal(
    isAllowedOrigin('https://www.adrianmoreno.info.evil.test', PROD, { SITE_BASE_URL: PROD }),
    false,
  );
});

test('a different vercel.app deployment is rejected', () => {
  assert.equal(
    isAllowedOrigin('https://someone-elses-app.vercel.app', PREVIEW, { SITE_BASE_URL: PROD }),
    false,
  );
});
