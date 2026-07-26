const API = 'https://api.resend.com';

// Bounded so a hung request fails the workflow step with a clear message
// instead of sitting until the job's own timeout.
const TIMEOUT_MS = 30_000;

/**
 * Create a broadcast as a DRAFT. `send` is omitted, which Resend defaults to
 * false. Nothing reaches a subscriber until a human opens the dashboard and
 * clicks Send. This is the most important behaviour in the send pipeline — an
 * email blast cannot be recalled.
 */
export async function createDraftBroadcast({ apiKey, segmentId, from, subject, html, name }) {
  let res;
  try {
    res = await fetch(`${API}/broadcasts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ segment_id: segmentId, from, subject, html, name }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`Resend broadcast creation timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  }

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    throw new Error(
      `Resend broadcast creation failed (${res.status}): ${parsed?.message ?? text}`,
    );
  }
  return parsed;
}
