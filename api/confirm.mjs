import { verifyToken, normalizeEmail } from './_lib/token.mjs';
import { confirmContact } from './_lib/resend.mjs';
import { siteOrigin } from './_lib/origin.mjs';
import { requireEnv, missingEnv } from './_lib/env.mjs';

const REQUIRED_ENV = ['RESEND_API_KEY', 'NEWSLETTER_SECRET'];

export default async function handler(req, res) {
  // Redirect back into this same deployment, so a preview's confirmation round
  // trip can be tested without bouncing the user to production.
  const siteUrl = siteOrigin(req);
  const expired = () => res.redirect(302, `${siteUrl}/newsletter/link-expired/`);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Checked before the token comparison. Without NEWSLETTER_SECRET, verifyToken
  // simply returns false and the visitor lands on "link expired" with nothing
  // logged — a misconfiguration that looks exactly like an expired link.
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error('confirm misconfigured', { missing });
    return expired();
  }

  const { e, x, t } = req.query ?? {};
  const email = normalizeEmail(e);

  if (!email || !x || !t) return expired();
  if (!verifyToken(email, x, t, process.env.NEWSLETTER_SECRET)) return expired();

  try {
    const env = requireEnv(REQUIRED_ENV);
    await confirmContact({ email, apiKey: env.RESEND_API_KEY });
    return res.redirect(302, `${siteUrl}/newsletter/confirmed/`);
  } catch (err) {
    console.error('confirm failed', { message: err.message, status: err.status });
    return expired();
  }
}
