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

  // Book detail dialog: progressive enhancement over the plain <a href="/books/<slug>/">
  // links rendered by layouts/book/summary.html. Without JS (or without Bootstrap's
  // Modal available) the links just navigate to the book's own page, which is fully
  // crawlable and works standalone. With JS, clicks are intercepted and open an
  // accessible Bootstrap modal instead - full-screen on mobile, centered on desktop.
  var triggers = document.querySelectorAll('.book-card-link[data-book-trigger]');

  if (triggers.length && window.bootstrap && window.bootstrap.Modal) {
    var modalEl = document.createElement('div');
    modalEl.className = 'modal fade book-detail-modal';
    modalEl.setAttribute('tabindex', '-1');
    modalEl.setAttribute('aria-labelledby', 'book-detail-title');
    modalEl.innerHTML =
      '<div class="modal-dialog modal-dialog-scrollable modal-dialog-centered modal-fullscreen-sm-down">' +
        '<div class="modal-content">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title book-detail-title" id="book-detail-title"></h2>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="book-detail-cover">' +
              '<img class="book-detail-cover-img" alt="">' +
            '</div>' +
            '<p class="book-detail-authors"></p>' +
            '<div class="book-detail-content"></div>' +
            '<div class="book-detail-links">' +
              '<a class="goodreads-link book-detail-goodreads" target="_blank" rel="noopener noreferrer">' +
                '<img class="goodreads-search" src="/img/goodreads.svg" alt="" width="20" height="20">' +
                'Find on Goodreads' +
              '</a>' +
              '<a class="book-detail-permalink">View book page</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    var modal = new window.bootstrap.Modal(modalEl);
    var lastTrigger = null;

    var titleEl = modalEl.querySelector('.book-detail-title');
    var authorsEl = modalEl.querySelector('.book-detail-authors');
    var coverImgEl = modalEl.querySelector('.book-detail-cover-img');
    var contentEl = modalEl.querySelector('.book-detail-content');
    var goodreadsEl = modalEl.querySelector('.book-detail-goodreads');
    var permalinkEl = modalEl.querySelector('.book-detail-permalink');

    function openDetail(trigger) {
      lastTrigger = trigger;

      var title = trigger.getAttribute('data-title') || '';
      var authors = trigger.getAttribute('data-authors') || '';
      var cover = trigger.getAttribute('data-cover') || '';
      var goodreads = trigger.getAttribute('data-goodreads') || '';
      var permalink = trigger.getAttribute('href') || '';
      var contentSource = trigger.closest('.book-card').querySelector('.book-detail-content-source');

      titleEl.textContent = title;
      authorsEl.textContent = authors;
      authorsEl.hidden = !authors;

      coverImgEl.src = cover;
      coverImgEl.alt = authors ? 'Cover of ' + title + ' by ' + authors : 'Cover of ' + title;

      contentEl.innerHTML = '';
      if (contentSource) {
        contentEl.appendChild(contentSource.content.cloneNode(true));
      }

      goodreadsEl.href = goodreads;
      goodreadsEl.hidden = !goodreads;
      permalinkEl.href = permalink;

      modal.show();
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        // Let modified/middle clicks behave like a normal link (open in new tab, etc.)
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openDetail(trigger);
      });
    });

    modalEl.addEventListener('hidden.bs.modal', function () {
      if (lastTrigger) lastTrigger.focus();
    });
  }
})();
