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

  // Keep the active pill scrolled into view within the horizontally
  // scrolling strip as Bootstrap's scrollspy activates each category.
  document.body.addEventListener('activate.bs.scrollspy', function (event) {
    var link = event.relatedTarget;
    if (!link || !nav.contains(link)) return;
    link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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
        // Keyboard-activated clicks (Enter on a focused link) report detail === 0;
        // let those navigate natively to the book page instead of opening the modal.
        if (event.detail === 0) return;
        event.preventDefault();
        openDetail(trigger);
      });
    });

    modalEl.addEventListener('hidden.bs.modal', function () {
      if (lastTrigger) lastTrigger.focus();
    });
  }

  // 3D book covers (Stripe Press inspired): each `[data-book-3d]` scene gets
  // a spine color sampled from its own cover image, plus a pointer-tracked
  // sheen on hover. Skipped for reduced motion / touch, where CSS renders
  // the books flat and the sheen never becomes visible anyway.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var books3d = document.querySelectorAll('[data-book-3d]');

  books3d.forEach(function (book) {
    sampleSpineColor(book);
    if (!reduceMotion && !coarsePointer) attachSheen(book);
  });

  function attachSheen(book) {
    var ticking = false;
    var lastEvent = null;

    function update() {
      ticking = false;
      if (!lastEvent) return;
      var rect = book.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = Math.min(100, Math.max(0, ((lastEvent.clientX - rect.left) / rect.width) * 100));
      var y = Math.min(100, Math.max(0, ((lastEvent.clientY - rect.top) / rect.height) * 100));
      book.style.setProperty('--sheen-x', x.toFixed(1) + '%');
      book.style.setProperty('--sheen-y', y.toFixed(1) + '%');
    }

    book.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      lastEvent = event;
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    });

    book.addEventListener('pointerleave', function (event) {
      if (event.pointerType === 'touch') return;
      book.style.removeProperty('--sheen-x');
      book.style.removeProperty('--sheen-y');
    });
  }

  // Derives a spine shade from the average color of the cover's left edge,
  // falling back to the neutral CSS gradient (see books.scss) if the image
  // hasn't decoded yet or a canvas read fails for any reason.
  function sampleSpineColor(book) {
    var img = book.querySelector('.book-cover, .book-single-cover');
    if (!img) return;

    function apply() {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 12;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var data = ctx.getImageData(0, 0, 2, canvas.height).data;
        var r = 0, g = 0, b = 0, count = 0;
        for (var i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = r / count;
        g = g / count;
        b = b / count;

        function shade(v, f) {
          return Math.max(0, Math.min(255, Math.round(v * f)));
        }

        var c1 = 'rgb(' + shade(r, 0.62) + ', ' + shade(g, 0.62) + ', ' + shade(b, 0.62) + ')';
        var c2 = 'rgb(' + shade(r, 0.32) + ', ' + shade(g, 0.32) + ', ' + shade(b, 0.32) + ')';
        book.style.setProperty('--spine-c1', c1);
        book.style.setProperty('--spine-c2', c2);
      } catch (e) {
        // Cross-origin or decode failure: the neutral CSS gradient fallback applies.
      }
    }

    if (img.complete && img.naturalWidth) {
      apply();
    } else {
      img.addEventListener('load', apply, { once: true });
    }
  }
})();
