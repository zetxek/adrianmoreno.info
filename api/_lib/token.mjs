import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_SECONDS = 48 * 60 * 60;

/**
 * Normalise an address so signing and verifying agree on the exact bytes.
 * Casing and surrounding whitespace must not change the signature, or a user
 * who typed a capital letter would get a link that fails to verify.
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function computeMac(email, expires, secret) {
  return createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}.${expires}`)
    .digest('base64url');
}

/**
 * @param {string} email
 * @param {string} secret
 * @param {number} [expiresAt] Unix seconds. Defaults to 48h from now.
 * @returns {{token: string, expires: number}}
 */
export function signToken(email, secret, expiresAt) {
  if (!secret) throw new Error('NEWSLETTER_SECRET is not set');
  const expires = expiresAt ?? Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return { token: computeMac(email, expires, secret), expires };
}

/**
 * @returns {boolean} true only if the signature matches AND has not expired.
 */
export function verifyToken(email, expires, token, secret) {
  if (!secret || !token) return false;

  const expiresNum = Number(expires);
  if (!Number.isInteger(expiresNum)) return false;
  if (expiresNum < Math.floor(Date.now() / 1000)) return false;

  const expected = computeMac(email, expiresNum, secret);

  // Compare in constant time so response latency cannot leak how much of the
  // signature an attacker guessed correctly.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
