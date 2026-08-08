/*
 * Overrides the theme's subscription.js, which posts to "" (the current page)
 * instead of the form's action and therefore never works.
 *
 * Adds: honeypot field, real error surfacing, a guard against double
 * submission, and support for more than one form per page.
 *
 * Note on IDs: the theme's shortcode emits the same element IDs for every
 * instance, so a page rendering the newsletter block twice (its own plus the
 * footer) has duplicate IDs. That is invalid HTML we inherit rather than
 * introduce, so this script never relies on document-wide ID lookups — it
 * walks each form's own section instead.
 */
(function () {
  'use strict';

  function panelsFor(form) {
    // Scope to the enclosing section so each form talks to its own
    // success/error panels rather than the first pair in the document.
    var scope = form.closest('.section') || document;
    var success = scope.querySelector('[id="rad-subscription-success"]');
    var fail = scope.querySelector('[id="rad-subscription-fail"]');

    // .rad-subscription-group is the rounded pill: a 56px-tall flex row whose
    // children are the form and these two panels. The theme expects a panel to
    // replace the form, so it hides the form on both outcomes.
    //
    // On success that is right — the form has done its job. On failure it is
    // not: the visitor needs the form to try again. Keeping both visible inside
    // the pill squeezes the message in beside the input, so move the error out
    // of the pill and let it sit underneath.
    var group = fail && fail.closest('.rad-subscription-group');
    if (group && group.parentNode) {
      group.parentNode.insertBefore(fail, group.nextSibling);
      fail.classList.add('rad-subscription-fail--below');
    }

    return { success: success, fail: fail };
  }

  function addHoneypot(form) {
    var honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.className = 'rad-subscription-website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText =
      'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    form.appendChild(honeypot);
    return honeypot;
  }

  function hide(el) {
    if (!el) return;
    el.classList.add('d-none');
    el.classList.remove('d-flex');
  }

  function show(el) {
    if (!el) return;
    el.classList.remove('d-none');
    el.classList.add('d-flex');
  }

  function initForm(form) {
    if (form.dataset.radSubscriptionReady) return;
    form.dataset.radSubscriptionReady = '1';

    var panels = panelsFor(form);
    var submit = form.querySelector('[id="rad-subscription-submit"]');
    var emailInput = form.querySelector('[id="rad-subscription-email"]');
    if (!submit || !emailInput) return;

    var honeypot = addHoneypot(form);
    var busy = false;
    var submitLabel = submit.textContent;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;

      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }

      // Clear any error from a previous attempt, so a retry that succeeds does
      // not leave a stale failure message on screen next to the success one.
      hide(panels.fail);

      busy = true;
      submit.classList.add('is-loading');
      submit.textContent = '';
      var loadingLabel = document.createElement('span');
      loadingLabel.className = 'rad-subscription-submit-label';
      loadingLabel.textContent = 'Sending…';
      submit.appendChild(loadingLabel);
      submit.setAttribute('aria-busy', 'true');
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
          show(panels.success);
        })
        .catch(function () {
          show(panels.fail);
        })
        .finally(function () {
          busy = false;
          submit.classList.remove('is-loading');
          submit.textContent = submitLabel;
          submit.removeAttribute('aria-busy');
          submit.disabled = false;
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('[id="rad-subscription"]');
    Array.prototype.forEach.call(forms, initForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
