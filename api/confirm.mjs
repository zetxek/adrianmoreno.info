import { verifyToken, normalizeEmail } from './_lib/token.mjs';
import { confirmContact } from './_lib/resend.mjs';
import { siteOrigin } from './_lib/origin.mjs';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export default async function handler(req, res) {
  // Redirect back into this same deployment, so a preview's confirmation round
  // trip can be tested without bouncing the user to production.
  const siteUrl = siteOrigin(req);
  const expired = () => res.redirect(302, `${siteUrl}/newsletter/link-expired/`);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { e, x, t } = req.query ?? {};
  const email = normalizeEmail(e);

  if (!email || !x || !t) return expired();
  if (!verifyToken(email, x, t, process.env.NEWSLETTER_SECRET)) return expired();

  try {
    await confirmContact({ email, apiKey: requireEnv('RESEND_API_KEY') });
    return res.redirect(302, `${siteUrl}/newsletter/confirmed/`);
  } catch (err) {
    console.error('confirm failed', { message: err.message, status: err.status });
    return expired();
  }
}
