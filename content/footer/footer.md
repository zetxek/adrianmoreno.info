+++
title =  "Footer"
type = "footer"
draft = false
+++

{{< newsletter-section
    newsletter_title="Get new posts by email"
    newsletter_button="Subscribe"
    newsletter_placeholder="your@email.com"
    newsletter_success_message="Almost there — check your inbox and click the confirmation link."
    newsletter_error_message="Something went wrong. Please try again in a moment."
    newsletter_note="No more than one email per post. Unsubscribe any time. See the <a href='/privacy/'>privacy notice</a>."
    form_action="/api/subscribe"
    form_method="POST" >}}

{{< contact-section
    title="Reach out" 
    contact_form_name="Your name"
    contact_form_email="Your e-mail"
    contact_form_message="Your message"
    contact_button="Send message"
    contact_phone_title="My phone"
    contact_phone_number="<a href='tel:+4531579827'>+4531579827</a>"
    contact_email_title="My mail"
    contact_email_email="info@adrianmoreno.info"
    contact_address_title="My location"
    contact_address_address="🇩🇰 Copenhagen, Denmark"
    form_action="https://formspree.io/info@adrianmoreno.info"
    form_method="POST" >}}
