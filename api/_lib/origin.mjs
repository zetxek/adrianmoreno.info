/**
 * Where "this site" is, and which origins may post to it.
 *
 * A single Vercel preview answers on several hostnames — the immutable
 * deployment URL (VERCEL_URL), the branch alias, and any custom domain — and a
 * browser hits whichever one the user typed. Enumerating them is a losing game,
 * so both functions below key off the request's own Host header instead. The
 * property we actually want is same-origin: the form was served by the same
 * host now receiving the POST.
 */

const FALLBACK = 'https://www.adrianmoreno.info';

/** The origin the browser is talking to, from the request itself. */
export function requestOrigin(req) {
  const host = req?.headers?.host;
  if (!host) return null;
  // Vercel terminates TLS at the edge, so the inbound request is plain HTTP and
  // only x-forwarded-proto reflects what the browser used.
  const proto = req.headers['x-forwarded-proto'] ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * The origin to use when building links and redirects.
 *
 * Production always uses the canonical URL: using the request host there would
 * put a deployment-specific hostname into subscribers' inboxes, and those links
 * break as soon as the deployment is superseded. Previews use the request host
 * so a confirmation round trip stays inside the deployment being tested.
 */
export function siteOrigin(req, env = process.env) {
  const isPreview = env.VERCEL_ENV && env.VERCEL_ENV !== 'production';
  if (isPreview) {
    const origin = requestOrigin(req);
    if (origin) return origin;
  }
  return env.SITE_BASE_URL ?? FALLBACK;
}

/**
 * @param {string|undefined} origin The request's Origin header.
 * @param {object} req The request, for its Host header.
 *
 * A missing Origin is allowed: non-browser clients omit it, and this header is
 * a defence against cross-site form posts, not an authentication mechanism.
 */
export function isAllowedOrigin(origin, req, env = process.env) {
  if (!origin) return true;

  // Same-origin: covers production, preview deployment URLs, branch aliases,
  // custom domains and localhost without listing any of them.
  if (origin === requestOrigin(req)) return true;

  // The canonical site, so a production page can post to a preview if ever needed.
  if (origin === (env.SITE_BASE_URL ?? FALLBACK)) return true;

  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;

  return false;
}
