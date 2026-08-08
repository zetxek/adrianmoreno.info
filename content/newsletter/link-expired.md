---
title: "That link didn't work"
url: newsletter/link-expired
description: "The confirmation link has expired or is invalid."
sitemap:
  disable: true
---

Confirmation links expire after 48 hours, and each one only works for the address it
was sent to. If you copied it by hand, a character may have been dropped.

Enter your email again and I'll send a fresh one.

{{< newsletter-section
    newsletter_title="Try again"
    newsletter_button="Send a new link"
    newsletter_placeholder="your@email.com"
    newsletter_success_message="Sent — check your inbox."
    newsletter_error_message="Something went wrong. Please try again in a moment."
    newsletter_note="See the <a href='/privacy/'>privacy notice</a>."
    form_action="/api/subscribe"
    form_method="POST" >}}
