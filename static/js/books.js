(function () {
  var nav = document.getElementById('book-nav');
  if (!nav) return;

  var header = document.getElementById('header');

  function syncHeaderOffset() {
    var headerHeight = header ? header.offsetHeight : 0;
    document.documentElement.style.setProperty('--book-header-offset', headerHeight + 'px');
  }
  syncHeaderOffset();
  window.addEventListener('resize', syncHeaderOffset);

  // The header shrinks a bit after the page is scrolled (see the theme's
  // sticky-header.js), so keep the offset in sync while scrolling too.
  var offsetTicking = false;
  window.addEventListener('scroll', function () {
    if (offsetTicking) return;
    offsetTicking = true;
    window.requestAnimationFrame(function () {
      syncHeaderOffset();
      offsetTicking = false;
    });
  });

  // Pin the nav bar once its spacer scrolls under the header. `position:
  // sticky` doesn't work here because the theme sets `body { overflow:
  // hidden }` and scrolls via `html` instead, which breaks sticky's
  // containing-block resolution — so pinning is done manually with a
  // fixed position + a spacer to prevent a layout jump.
  var spacer = document.createElement('div');
  spacer.className = 'book-nav-spacer';
  nav.parentNode.insertBefore(spacer, nav.nextSibling);

  function pin() {
    if (nav.classList.contains('is-pinned')) return;
    var rect = nav.getBoundingClientRect();
    spacer.style.height = rect.height + 'px';
    spacer.classList.add('is-active');
    nav.style.left = rect.left + 'px';
    nav.style.width = rect.width + 'px';
    nav.classList.add('is-pinned');
  }

  function unpin() {
    if (!nav.classList.contains('is-pinned')) return;
    nav.classList.remove('is-pinned');
    nav.style.left = '';
    nav.style.width = '';
    spacer.classList.remove('is-active');
    spacer.style.height = '';
  }

  function measureAndTogglePin(sentinelTop) {
    var headerHeight = header ? header.offsetHeight : 0;
    if (sentinelTop <= headerHeight) {
      pin();
    } else {
      unpin();
    }
  }

  var sentinel = document.createElement('div');
  sentinel.className = 'book-nav-sentinel';
  nav.parentNode.insertBefore(sentinel, nav);

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          measureAndTogglePin(entry.boundingClientRect.top);
        });
      },
      { threshold: [0, 1] }
    );
    observer.observe(sentinel);
  }

  // Re-measure the pinned nav's width/position on resize (using the
  // spacer, which stays in normal flow, as the source of truth).
  window.addEventListener('resize', function () {
    if (!nav.classList.contains('is-pinned')) return;
    var rect = spacer.getBoundingClientRect();
    nav.style.left = rect.left + 'px';
    nav.style.width = rect.width + 'px';
  });

  // Smooth-scroll to category sections, accounting for the fixed header + pinned nav.
  var navLinks = nav.querySelectorAll('.book-nav-link');
  navLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var targetId = link.getAttribute('href').slice(1);
      var target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      var offset = (header ? header.offsetHeight : 0) + nav.offsetHeight + 16;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
      history.pushState(null, '', '#' + targetId);
    });
  });

  // Book cover overlays: shown on hover/focus via CSS; tap-to-toggle here for touch devices.
  var toggles = document.querySelectorAll('.book-cover-btn[aria-expanded]');

  function closeAll(except) {
    toggles.forEach(function (btn) {
      if (btn === except) return;
      btn.closest('.book-card').classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  toggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.book-card');
      var isActive = card.classList.toggle('is-active');
      btn.setAttribute('aria-expanded', String(isActive));
      closeAll(isActive ? btn : null);
    });
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.book-card')) closeAll(null);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAll(null);
  });
})();
