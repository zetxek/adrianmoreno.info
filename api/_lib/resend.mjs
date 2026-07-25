const API = 'https://api.resend.com';

class ResendError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ResendError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'POST', body, apiKey }) {
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    throw new ResendError(
      parsed?.message ?? `Resend ${method} ${path} failed with ${res.status}`,
      res.status,
      parsed,
    );
  }
  return parsed;
}

/**
 * Create a contact already inside the segment but globally unsubscribed.
 *
 * Segment membership can only be granted at creation — PATCH /contacts does not
 * accept `segments`. Because `unsubscribed: true` means "unsubscribed from all
 * broadcasts", an unconfirmed contact sitting in the segment can never receive
 * one. Confirmation flips the flag; it does not change membership.
 */
export function createPendingContact({ email, segmentId, apiKey }) {
  return request('/contacts', {
    apiKey,
    body: {
      email,
      unsubscribed: true,
      segments: [segmentId],
      properties: { source: 'website', requested_at: new Date().toISOString() },
    },
  });
}

/** Flip the contact to subscribed and stamp the consent time. */
export function confirmContact({ email, apiKey }) {
  return request(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    apiKey,
    body: {
      unsubscribed: false,
      properties: { source: 'website', confirmed_at: new Date().toISOString() },
    },
  });
}

export function sendEmail({ from, to, subject, html, text, apiKey }) {
  return request('/emails', { apiKey, body: { from, to, subject, html, text } });
}

export { ResendError };
