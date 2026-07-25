function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The confirmation email. Deliberately plain: no images, no tracking, one link.
 * Anything more decorative raises the odds of landing in spam, which for a
 * confirmation email means the subscription silently fails.
 */
export function confirmationEmail({ confirmUrl, siteUrl }) {
  const safeUrl = escapeHtml(confirmUrl);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="margin:0 0 16px;">Hi,</p>
    <p style="margin:0 0 16px;">
      Please confirm you want to receive new posts from
      <a href="${escapeHtml(siteUrl)}" style="color:#0066cc;">adrianmoreno.info</a> by email.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;">Confirm subscription</a>
    </p>
    <p style="margin:0 0 16px;color:#666;font-size:14px;">
      Or paste this into your browser:<br>
      <a href="${safeUrl}" style="color:#0066cc;word-break:break-all;">${safeUrl}</a>
    </p>
    <p style="margin:0 0 16px;color:#666;font-size:14px;">
      This link expires in 48 hours. If you did not request this, ignore this email —
      no one is added to the list without clicking above.
    </p>
    <p style="margin:0;">— Adrián</p>
  </div>
</body>
</html>`;

  const text = `Hi,

Please confirm you want to receive new posts from adrianmoreno.info by email:

${confirmUrl}

This link expires in 48 hours. If you did not request this, ignore this email —
no one is added to the list without clicking the link above.

— Adrián`;

  return { html, text };
}
