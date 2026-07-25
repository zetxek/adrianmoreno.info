/**
 * Where "this site" is, and which origins may post to it.
 *
 * Preview deployments have their own hostname. If the functions only ever knew
 * the canonical production URL, a form submitted from a preview would be
 * rejected as a foreign origin and confirmation links would point at
 * production — which makes the whole signup flow untestable before release.
 */

const FALLBACK = 'https://www.adrianmoreno.info';

/**
 * The origin this deployment should use for its own links and redirects.
 *
 * Production always uses the canonical URL. Using VERCEL_URL there would leak
 * the internal deployment hostname into subscribers' inboxes and produce links
 * that stop working once the deployment is superseded.
 */
export function siteOrigin(env = process.env) {
  const isPreview = env.VERCEL_ENV && env.VERCEL_ENV !== 'production';
  if (isPreview && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return env.SITE_BASE_URL ?? FALLBACK;
}

/**
 * @param {string|undefined} origin The request's Origin header.
 * @param {string} self The value returned by siteOrigin().
 *
 * A missing Origin is allowed: non-browser clients omit it, and the header is
 * a defence against cross-site form posts, not an authentication mechanism.
 */
export function isAllowedOrigin(origin, self, env = process.env) {
  if (!origin) return true;
  if (origin === self) return true;
  if (origin === (env.SITE_BASE_URL ?? FALLBACK)) return true;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}
