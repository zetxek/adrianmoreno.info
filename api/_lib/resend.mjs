const API = 'https://api.resend.com';

// A stalled upstream call would otherwise hold the serverless function open
// until the platform's own timeout, burning execution time and leaving the
// subscriber staring at a spinner. Fail fast instead.
const TIMEOUT_MS = 10_000;

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

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new ResendError(`Resend ${method} ${path} timed out after ${TIMEOUT_MS}ms`, 504, {});
    }
    throw err;
  }

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
 *
 * `properties` here (`source`, `requested_at`, `confirmed_at`) are custom
 * contact properties, which Resend validates against a predefined schema —
 * unlike `unsubscribed` or `segments`, sending a key that was never registered
 * on the account fails the whole call with 422 "One or more properties do not
 * exist". They must be created once per Resend account before this code will
 * work: `resend contact-properties create --key <name> --type string` for each
 * of the three keys used below. This is account setup, not something the
 * application can or should do at request time.
 */
export function createPendingContact({ email, segmentId, apiKey }) {
  return request('/contacts', {
    apiKey,
    body: {
      email,
      unsubscribed: true,
      // Array of objects, not bare IDs. `segments: [id]` is silently wrong.
      segments: [{ id: segmentId }],
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
