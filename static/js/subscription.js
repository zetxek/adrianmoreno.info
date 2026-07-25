/*
 * Overrides the theme's subscription.js, which posts to "" (the current page)
 * instead of the form's action and therefore never works.
 *
 * Adds: honeypot field, real error surfacing, and a guard against double
 * submission while a request is in flight.
 */
(function () {
  'use strict';

  function init() {
    var form = document.querySelector('#rad-subscription');
    if (!form) return;

    var successBox = document.querySelector('#rad-subscription-success');
    var failBox = document.querySelector('#rad-subscription-fail');
    var submit = form.querySelector('#rad-subscription-submit');
    var emailInput = form.querySelector('#rad-subscription-email');

    // Honeypot. Hidden from people, irresistible to bots.
    var honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.id = 'rad-subscription-website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText =
      'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    form.appendChild(honeypot);

    var busy = false;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;

      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }

      busy = true;
      submit.classList.add('is-loading');
      submit.disabled = true;

      fetch(form.getAttribute('action') || '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value,
          website: honeypot.value
        })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('request failed');
          form.classList.add('d-none');
          if (successBox) {
            successBox.classList.remove('d-none');
            successBox.classList.add('d-flex');
          }
        })
        .catch(function () {
          if (failBox) {
            failBox.classList.remove('d-none');
            failBox.classList.add('d-flex');
          }
        })
        .finally(function () {
          busy = false;
          submit.classList.remove('is-loading');
          submit.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
