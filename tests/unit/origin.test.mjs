import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOrigin, isAllowedOrigin, requestOrigin } from '../../api/_lib/origin.mjs';

const PROD = 'https://www.adrianmoreno.info';

// Vercel answers one preview on several hostnames. These are the two that
// matter: the immutable deployment URL and the branch alias a human visits.
const DEPLOY_HOST = 'adrianmoreno-info-hx3o2ckvr-adrianmoreno.vercel.app';
const BRANCH_HOST = 'adrianmoreno-info-git-claude-blog-newslette-42127d-adrianmoreno.vercel.app';

const req = (host, proto = 'https') => ({
  headers: { host, 'x-forwarded-proto': proto },
});

test('requestOrigin builds the origin from Host and forwarded proto', () => {
  assert.equal(requestOrigin(req(BRANCH_HOST)), `https://${BRANCH_HOST}`);
});

test('requestOrigin returns null without a Host header', () => {
  assert.equal(requestOrigin({ headers: {} }), null);
});

test('production ignores the request host and uses the canonical URL', () => {
  const env = { VERCEL_ENV: 'production', SITE_BASE_URL: PROD };
  assert.equal(siteOrigin(req(DEPLOY_HOST), env), PROD);
});

test('a preview uses the host the browser actually reached', () => {
  const env = { VERCEL_ENV: 'preview', SITE_BASE_URL: PROD };
  assert.equal(siteOrigin(req(BRANCH_HOST), env), `https://${BRANCH_HOST}`);
});

test('a preview with no Host header falls back to the canonical URL', () => {
  const env = { VERCEL_ENV: 'preview', SITE_BASE_URL: PROD };
  assert.equal(siteOrigin({ headers: {} }, env), PROD);
});

test('outside Vercel it uses SITE_BASE_URL', () => {
  assert.equal(siteOrigin(req('whatever'), { SITE_BASE_URL: 'https://example.test' }), 'https://example.test');
});

test('with nothing configured it falls back to the canonical URL', () => {
  assert.equal(siteOrigin({ headers: {} }, {}), PROD);
});

test('a request with no Origin header is allowed', () => {
  assert.equal(isAllowedOrigin(undefined, req(PROD), {}), true);
});

test('the branch alias may post to itself — the case that was returning 403', () => {
  assert.equal(
    isAllowedOrigin(`https://${BRANCH_HOST}`, req(BRANCH_HOST), { SITE_BASE_URL: PROD }),
    true,
  );
});

test('the deployment URL may post to itself', () => {
  assert.equal(
    isAllowedOrigin(`https://${DEPLOY_HOST}`, req(DEPLOY_HOST), { SITE_BASE_URL: PROD }),
    true,
  );
});

test('production may post to itself', () => {
  assert.equal(
    isAllowedOrigin(PROD, req('www.adrianmoreno.info'), { SITE_BASE_URL: PROD }),
    true,
  );
});

test('localhost is allowed for development', () => {
  assert.equal(isAllowedOrigin('http://localhost:1313', req('localhost:1313', 'http'), {}), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:1313', req('127.0.0.1:1313', 'http'), {}), true);
});

test('an unrelated origin is rejected', () => {
  assert.equal(
    isAllowedOrigin('https://evil.example', req(BRANCH_HOST), { SITE_BASE_URL: PROD }),
    false,
  );
});

test('an origin merely prefixed by the site URL is rejected', () => {
  // Guards against the substring check this replaced, under which
  // "https://www.adrianmoreno.info.evil.test" passed startsWith().
  assert.equal(
    isAllowedOrigin('https://www.adrianmoreno.info.evil.test', req('www.adrianmoreno.info'), {
      SITE_BASE_URL: PROD,
    }),
    false,
  );
});

test('one preview may not post to another', () => {
  assert.equal(
    isAllowedOrigin(`https://${DEPLOY_HOST}`, req(BRANCH_HOST), { SITE_BASE_URL: PROD }),
    false,
  );
});

test('a bare localhost origin with no port is rejected', () => {
  assert.equal(isAllowedOrigin('http://localhost', req(BRANCH_HOST), { SITE_BASE_URL: PROD }), false);
});
