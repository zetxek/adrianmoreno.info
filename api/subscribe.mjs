import { signToken, normalizeEmail } from './_lib/token.mjs';
import { createPendingContact, sendEmail } from './_lib/resend.mjs';
import { confirmationEmail } from './_lib/emails.mjs';
import { siteOrigin, isAllowedOrigin } from './_lib/origin.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // On a preview deployment this is the preview's own hostname, so the
  // confirmation link stays inside the deployment being tested.
  const siteUrl = siteOrigin(req);

  // Only accept submissions originating from our own pages.
  if (!isAllowedOrigin(req.headers.origin, req)) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body ?? {});

  // Honeypot. Bots fill every field they find; humans never see this one.
  // Answer 200 so the bot cannot distinguish success from rejection.
  if (body.website) return res.status(200).json({ ok: true });

  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  try {
    await createPendingContact({
      email,
      segmentId: requireEnv('RESEND_SEGMENT_ID'),
      apiKey: requireEnv('RESEND_API_KEY'),
    });

    const { token, expires } = signToken(email, requireEnv('NEWSLETTER_SECRET'));
    const confirmUrl =
      `${siteUrl}/api/confirm?e=${encodeURIComponent(email)}&x=${expires}&t=${token}`;

    const { html, text } = confirmationEmail({ confirmUrl, siteUrl });

    await sendEmail({
      from: requireEnv('NEWSLETTER_FROM'),
      to: email,
      subject: 'Confirm your subscription',
      html,
      text,
      apiKey: requireEnv('RESEND_API_KEY'),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log server-side for debugging; never leak provider detail to the client.
    console.error('subscribe failed', { message: err.message, status: err.status });
    return res.status(503).json({ error: 'temporarily_unavailable' });
  }
}
