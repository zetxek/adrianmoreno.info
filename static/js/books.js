(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;

  // ---------------------------------------------------------------------------
  // Sticky category navigation (books list page only)
  // ---------------------------------------------------------------------------
  var nav = document.getElementById('book-nav');
  if (nav) {
    var header = document.getElementById('header');

    function getHeaderRect() {
      return header ? header.getBoundingClientRect() : { height: 0, bottom: 0 };
    }

    // Use getBoundingClientRect() rather than offsetHeight: the header's
    // rendered height/bottom can include subpixel values (e.g. 69.4px) that
    // offsetHeight rounds away, which was enough to leave a sliver of the
    // nav peeking out from under the header. The extra 1px is a safety gap.
    function syncHeaderOffset(headerRect) {
      document.documentElement.style.setProperty('--book-header-offset', (headerRect.height + 1) + 'px');
    }

    // Pin the nav bar once its spacer scrolls under the header. `position:
    // sticky` doesn't work here because the theme sets `body { overflow:
    // hidden }` and scrolls via `html` instead, which breaks sticky's
    // containing-block resolution — so pinning is done manually with a
    // fixed position + a spacer to prevent a layout jump.
    var spacer = document.createElement('div');
    spacer.className = 'book-nav-spacer';
    nav.parentNode.insertBefore(spacer, nav.nextSibling);

    var pin = function () {
      if (nav.classList.contains('is-pinned')) return;
      var rect = nav.getBoundingClientRect();
      spacer.style.height = rect.height + 'px';
      spacer.classList.add('is-active');
      nav.style.left = rect.left + 'px';
      nav.style.width = rect.width + 'px';
      nav.classList.add('is-pinned');
    };

    var unpin = function () {
      if (!nav.classList.contains('is-pinned')) return;
      nav.classList.remove('is-pinned');
      nav.style.left = '';
      nav.style.width = '';
      spacer.classList.remove('is-active');
      spacer.style.height = '';
    };

    var sentinel = document.createElement('div');
    sentinel.className = 'book-nav-sentinel';
    nav.parentNode.insertBefore(sentinel, nav);

    function measureAndTogglePin(headerRect) {
      var sentinelTop = sentinel.getBoundingClientRect().top;
      if (sentinelTop <= headerRect.bottom) {
        pin();
      } else {
        unpin();
      }
    }

    // The header shrinks a bit after the page is scrolled (see the theme's
    // sticky-header.js), and its bottom edge is what actually determines
    // when the nav should pin — an IntersectionObserver on the sentinel only
    // fires when the sentinel crosses the viewport edge, not when it crosses
    // the (shrinking) fixed header's bottom, so pin state is driven directly
    // off scroll/resize instead.
    function update() {
      var headerRect = getHeaderRect();
      syncHeaderOffset(headerRect);
      measureAndTogglePin(headerRect);
    }

    var updateTicking = false;
    function scheduleUpdate() {
      if (updateTicking) return;
      updateTicking = true;
      window.requestAnimationFrame(function () {
        update();
        updateTicking = false;
      });
    }
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    update();

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

    // Custom scrollspy: Bootstrap's scrollspy never fires here because the
    // theme scrolls via `html` (body overflow:hidden), so track the category
    // headings ourselves. The active section is the last heading above the
    // activation line (~35% viewport height), which matches reading position.
    var spyHeads = Array.prototype.slice.call(document.querySelectorAll('h2.book-category[id]'));

    function setActivePill(id) {
      navLinks.forEach(function (link) {
        var isActive = link.getAttribute('href') === '#' + id;
        link.classList.toggle('active', isActive);
        if (isActive) {
          link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
    }

    if (spyHeads.length) {
      var currentSpyId = null;
      var updateSpy = function () {
        var line = window.innerHeight * 0.35;
        var candidate = spyHeads[0];
        for (var i = 0; i < spyHeads.length; i++) {
          if (spyHeads[i].getBoundingClientRect().top <= line) candidate = spyHeads[i];
          else break;
        }
        if (candidate && candidate.id !== currentSpyId) {
          currentSpyId = candidate.id;
          setActivePill(currentSpyId);
        }
      };
      var spyTicking = false;
      window.addEventListener('scroll', function () {
        if (spyTicking) return;
        spyTicking = true;
        window.requestAnimationFrame(function () {
          updateSpy();
          spyTicking = false;
        });
      }, { passive: true });
      updateSpy();
    }
  }

  // ---------------------------------------------------------------------------
  // Book detail dialog: progressive enhancement over the plain <a href="/books/<slug>/">
  // links rendered by layouts/book/summary.html. Without JS (or without Bootstrap's
  // Modal available) the links just navigate to the book's own page, which is fully
  // crawlable and works standalone. With JS, clicks are intercepted and open an
  // accessible Bootstrap modal instead - full-screen on mobile, centered on desktop.
  //
  // `bindTriggers(root)` is exported so seamless scroll-navigation (below) can
  // re-wire the modal for book cards swapped into the page after a transition.
  // ---------------------------------------------------------------------------
  var bindTriggers = function () {};

  if (window.bootstrap && window.bootstrap.Modal) {
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
            '<time class="book-detail-year"></time>' +
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
    var yearEl = modalEl.querySelector('.book-detail-year');
    var coverImgEl = modalEl.querySelector('.book-detail-cover-img');
    var contentEl = modalEl.querySelector('.book-detail-content');
    var goodreadsEl = modalEl.querySelector('.book-detail-goodreads');
    var permalinkEl = modalEl.querySelector('.book-detail-permalink');

    // -------------------------------------------------------------------
    // Mobile "spine open" transition: on coarse-pointer devices, tapping a
    // card feels like picking the book up off the shelf. A ghost <img> is
    // FLIP-animated from the tapped card's cover rect to the modal's cover
    // rect (static/js/books.js has no layout access to the modal until it's
    // shown, hence the FLIP rather than a plain CSS transition); once it
    // lands, `.is-opening` hands off to `.is-open`, which drives the
    // spine-rotate + content settle in books.scss. Skipped for reduced
    // motion or fine pointers, where the modal opens exactly as before.
    // -------------------------------------------------------------------
    var spineGhost = null;

    function removeSpineGhost() {
      if (spineGhost && spineGhost.parentNode) spineGhost.parentNode.removeChild(spineGhost);
      spineGhost = null;
    }

    function cleanupSpineOpen() {
      modalEl.classList.remove('is-opening', 'is-open');
      removeSpineGhost();
    }

    function prepareSpineOpen(trigger) {
      var cardCover = trigger.querySelector('.book-cover');
      if (!cardCover || !cardCover.src) return;

      var rect = cardCover.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      removeSpineGhost();

      var ghost = document.createElement('img');
      ghost.src = cardCover.src;
      ghost.alt = '';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.className = 'book-spine-ghost';
      ghost.style.top = rect.top + 'px';
      ghost.style.left = rect.left + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      document.body.appendChild(ghost);
      spineGhost = ghost;

      modalEl.classList.add('is-opening');
    }

    // FLIP: the ghost starts painted exactly over the card cover, then
    // animates to the delta/scale needed to land on the modal cover - only
    // `transform`/`opacity` are ever animated, so this stays compositor-only.
    function runSpineOpen() {
      var ghost = spineGhost;
      if (!ghost || !ghost.animate || !coverImgEl.getBoundingClientRect) {
        modalEl.classList.remove('is-opening');
        modalEl.classList.add('is-open');
        removeSpineGhost();
        return;
      }

      var startRect = ghost.getBoundingClientRect();
      var endRect = coverImgEl.getBoundingClientRect();
      if (!endRect.width || !endRect.height) {
        modalEl.classList.remove('is-opening');
        modalEl.classList.add('is-open');
        removeSpineGhost();
        return;
      }

      var deltaX = endRect.left - startRect.left;
      var deltaY = endRect.top - startRect.top;
      var scaleX = endRect.width / startRect.width;
      var scaleY = endRect.height / startRect.height;

      var flight = ghost.animate(
        [
          { transform: 'translate(0px, 0px) scale(1, 1)' },
          { transform: 'translate(' + deltaX + 'px, ' + deltaY + 'px) scale(' + scaleX + ', ' + scaleY + ')' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );

      flight.onfinish = function () {
        if (!spineGhost) return;
        var fade = spineGhost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
        fade.onfinish = function () {
          removeSpineGhost();
          if (modalEl.classList.contains('is-opening')) {
            modalEl.classList.remove('is-opening');
            modalEl.classList.add('is-open');
          }
        };
      };
    }

    modalEl.addEventListener('shown.bs.modal', function () {
      if (!modalEl.classList.contains('is-opening')) return;
      runSpineOpen();
    });

    modalEl.addEventListener('hide.bs.modal', cleanupSpineOpen);
    modalEl.addEventListener('hidden.bs.modal', cleanupSpineOpen);

    function openDetail(trigger) {
      lastTrigger = trigger;

      var title = trigger.getAttribute('data-title') || '';
      var authors = trigger.getAttribute('data-authors') || '';
      var cover = trigger.getAttribute('data-cover') || '';
      var goodreads = trigger.getAttribute('data-goodreads') || '';
      var year = trigger.getAttribute('data-year') || '';
      var permalink = trigger.getAttribute('href') || '';
      var contentSource = trigger.closest('.book-card').querySelector('.book-detail-content-source');

      titleEl.textContent = title;
      authorsEl.textContent = authors;
      authorsEl.hidden = !authors;

      yearEl.textContent = year;
      yearEl.dateTime = year;
      yearEl.hidden = !year;

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

    modalEl.addEventListener('hidden.bs.modal', function () {
      if (lastTrigger) lastTrigger.focus();
    });

    bindTriggers = function (root) {
      var scope = root || document;
      var triggers = scope.querySelectorAll('.book-card-link[data-book-trigger]');
      triggers.forEach(function (trigger) {
        if (trigger.dataset.bookTriggerBound) return;
        trigger.dataset.bookTriggerBound = '1';
        trigger.addEventListener('click', function (event) {
          // Let modified/middle clicks behave like a normal link (open in new tab, etc.)
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          // Keyboard-activated clicks (Enter on a focused link) report detail === 0;
          // let those navigate natively to the book page instead of opening the modal.
          if (event.detail === 0) return;
          event.preventDefault();
          if (coarsePointer && !reduceMotion) prepareSpineOpen(trigger);
          openDetail(trigger);
        });
      });
    };
  }

  bindTriggers(document);

  // ---------------------------------------------------------------------------
  // 3D book covers (Stripe Press inspired): each `[data-book-3d]` scene gets
  // a spine color sampled from its own cover image, plus a pointer-tracked
  // sheen on hover. Skipped for reduced motion / touch, where CSS renders
  // the books flat and the sheen never becomes visible anyway.
  //
  // `init3DCovers(root)` is exported so seamless scroll-navigation (below)
  // can re-run this for the book cover swapped into the page after a
  // transition.
  // ---------------------------------------------------------------------------
  function init3DCovers(root) {
    var scope = root || document;
    var books3d = scope.querySelectorAll('[data-book-3d]');
    books3d.forEach(function (book) {
      if (book.dataset.book3dBound) return;
      book.dataset.book3dBound = '1';
      sampleSpineColor(book);
      if (!reduceMotion && !coarsePointer) attachSheen(book);
    });
  }

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
      if (img.decode) {
        img.decode().then(apply).catch(apply);
      } else {
        apply();
      }
    } else {
      img.addEventListener('load', function () {
        if (img.decode) {
          img.decode().then(apply).catch(apply);
        } else {
          apply();
        }
      }, { once: true });
    }
  }

  init3DCovers(document);

  // ---------------------------------------------------------------------------
  // Seamless scroll-to-next-book navigation (Stripe Press style), book single
  // pages only. Progressive enhancement over the plain prev/next pager
  // rendered by layouts/book/single.html (`.book-pager`) - that pager is
  // crawlable and fully functional with JS disabled. With JS, overscrolling
  // past the bottom (or top) of the page pulls the next (or previous) book's
  // card up as a cover over the page, and past a threshold swaps the page
  // content in place instead of a full navigation.
  // ---------------------------------------------------------------------------
  var viewport = document.getElementById('book-viewport');
  if (viewport && viewport.querySelector('.book-pager')) {
    initBookScrollNav(viewport);
  }

  function initBookScrollNav(initialViewport) {
    var THRESHOLD = 120;
    var navReduceMotion = reduceMotion;

    var state = {
      accum: 0, // overscroll progress toward THRESHOLD for the active direction
      direction: null, // 'next' | 'prev' | null
      transitioning: false,
      releaseTimer: null,
    };

    var cache = {}; // pathname -> {viewportHTML, title, description}

    var liveRegion = document.createElement('div');
    liveRegion.className = 'visually-hidden';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('role', 'status');
    document.body.appendChild(liveRegion);

    var overlayNext = document.createElement('div');
    overlayNext.className = 'book-scrollnav-overlay book-scrollnav-overlay--next';
    overlayNext.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlayNext);

    var overlayPrev = document.createElement('div');
    overlayPrev.className = 'book-scrollnav-overlay book-scrollnav-overlay--prev';
    overlayPrev.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlayPrev);

    function overlayFor(direction) {
      return direction === 'next' ? overlayNext : overlayPrev;
    }

    function resetOverlay(direction) {
      var overlay = overlayFor(direction);
      overlay.classList.remove('is-tracking');
      overlay.style.transform = direction === 'next' ? 'translateY(100%)' : 'translateY(-100%)';
    }

    function parsePage(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var newViewport = doc.getElementById('book-viewport');
      var descEl = doc.querySelector('meta[name="description"]');
      return {
        viewportHTML: newViewport ? newViewport.innerHTML : null,
        title: doc.title,
        description: descEl ? descEl.getAttribute('content') : '',
      };
    }

    function fetchAndCache(href) {
      if (cache[href]) return Promise.resolve(cache[href]);
      return fetch(href, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('Fetch failed: ' + res.status);
          return res.text();
        })
        .then(function (html) {
          var parsed = parsePage(html);
          cache[href] = parsed;
          return parsed;
        });
    }

    function prefetch(href) {
      if (!href || cache[href]) return;
      var run = function () {
        fetchAndCache(href).catch(function () {});
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        setTimeout(run, 300);
      }
    }

    // Re-reads the current viewport's pager, refreshes the fixed overlay
    // clones from it, and (re)schedules prefetch for the new prev/next.
    function refresh(viewportEl) {
      state.accum = 0;
      state.direction = null;

      var nextLink = viewportEl.querySelector('.book-pager-card--next');
      var prevLink = viewportEl.querySelector('.book-pager-card--prev');

      overlayNext.innerHTML = '';
      overlayPrev.innerHTML = '';
      if (nextLink) overlayNext.appendChild(nextLink.cloneNode(true));
      if (prevLink) overlayPrev.appendChild(prevLink.cloneNode(true));

      resetOverlay('next');
      resetOverlay('prev');

      if (!navReduceMotion) {
        if (nextLink) prefetch(nextLink.getAttribute('href'));
        if (prevLink) prefetch(prevLink.getAttribute('href'));
      }
    }

    function isAtBottom() {
      return window.innerHeight + Math.round(window.scrollY) >= document.documentElement.scrollHeight - 2;
    }

    function isAtTop() {
      return window.scrollY <= 0;
    }

    function armReleaseTimer() {
      clearTimeout(state.releaseTimer);
      state.releaseTimer = setTimeout(release, 160);
    }

    function release() {
      if (state.transitioning || !state.direction) return;
      if (state.accum < THRESHOLD) snapBack();
    }

    function snapBack() {
      var direction = state.direction;
      state.accum = 0;
      state.direction = null;
      if (direction) resetOverlay(direction);
    }

    function applyProgress(direction, amount) {
      state.direction = direction;
      state.accum = amount;
      var progress = Math.min(1, amount / THRESHOLD);
      var overlay = overlayFor(direction);
      var link = overlay.querySelector('.book-pager-card');
      if (!link) return;

      overlay.classList.add('is-tracking');
      var pct = direction === 'next' ? 100 - progress * 100 : -100 + progress * 100;
      overlay.style.transform = 'translateY(' + pct + '%)';

      if (progress >= 1 && !state.transitioning) {
        triggerTransition(direction, link.getAttribute('href'));
      }
    }

    function handleOverscrollDelta(delta) {
      // delta > 0 => user is pushing past the bottom (wants next)
      // delta < 0 => user is pushing past the top (wants prev)
      if (state.transitioning || !delta) return;

      if (delta > 0 && isAtBottom() && overlayNext.querySelector('.book-pager-card')) {
        applyProgress('next', Math.max(0, (state.direction === 'next' ? state.accum : 0) + delta));
        armReleaseTimer();
      } else if (delta < 0 && isAtTop() && overlayPrev.querySelector('.book-pager-card')) {
        applyProgress('prev', Math.max(0, (state.direction === 'prev' ? state.accum : 0) - delta));
        armReleaseTimer();
      } else if (
        state.direction &&
        ((state.direction === 'next' && delta < 0) || (state.direction === 'prev' && delta > 0))
      ) {
        // Scrolling back the other way while a gesture is building: bleed
        // the accumulator down instead of navigating.
        var next = Math.max(0, state.accum - Math.abs(delta));
        if (next === 0) {
          snapBack();
        } else {
          applyProgress(state.direction, next);
          armReleaseTimer();
        }
      }
    }

    if (!navReduceMotion) {
      window.addEventListener(
        'wheel',
        function (event) {
          handleOverscrollDelta(event.deltaY);
        },
        { passive: true }
      );

      var touchStartY = null;
      window.addEventListener(
        'touchstart',
        function (event) {
          touchStartY = event.touches[0].clientY;
        },
        { passive: true }
      );

      window.addEventListener(
        'touchmove',
        function (event) {
          if (touchStartY === null) return;
          var y = event.touches[0].clientY;
          var delta = touchStartY - y; // finger moves up => positive => wants next
          touchStartY = y;
          handleOverscrollDelta(delta);
        },
        { passive: true }
      );

      window.addEventListener('touchend', function () {
        touchStartY = null;
        release();
      });
    }

    function triggerTransition(direction, href) {
      if (!href || state.transitioning) return;
      state.transitioning = true;
      clearTimeout(state.releaseTimer);

      fetchAndCache(href)
        .then(function (parsed) {
          if (!parsed || !parsed.viewportHTML) {
            window.location.href = href;
            return;
          }
          applyPage(href, parsed);
        })
        .catch(function () {
          window.location.href = href;
        });
    }

    function announceAndFocus(viewportEl, fallbackTitle) {
      var heading = viewportEl.querySelector('.book-single-title');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
      liveRegion.textContent = 'Now viewing: ' + (heading ? heading.textContent : fallbackTitle);
    }

    function applyPage(href, parsed) {
      var viewportEl = document.getElementById('book-viewport');
      viewportEl.innerHTML = parsed.viewportHTML;

      document.title = parsed.title;
      var descEl = document.querySelector('meta[name="description"]');
      if (descEl) descEl.setAttribute('content', parsed.description || '');

      history.pushState({ bookNav: true }, '', href);
      window.scrollTo(0, 0);

      announceAndFocus(viewportEl, parsed.title);
      bindTriggers(viewportEl);
      init3DCovers(viewportEl);

      state.transitioning = false;
      refresh(viewportEl);
    }

    window.addEventListener('popstate', function () {
      var href = window.location.pathname;
      state.transitioning = true;
      fetchAndCache(href)
        .then(function (parsed) {
          state.transitioning = false;
          if (!parsed || !parsed.viewportHTML) return;
          var viewportEl = document.getElementById('book-viewport');
          viewportEl.innerHTML = parsed.viewportHTML;
          document.title = parsed.title;
          var descEl = document.querySelector('meta[name="description"]');
          if (descEl) descEl.setAttribute('content', parsed.description || '');
          window.scrollTo(0, 0);
          announceAndFocus(viewportEl, parsed.title);
          bindTriggers(viewportEl);
          init3DCovers(viewportEl);
          refresh(viewportEl);
        })
        .catch(function () {
          state.transitioning = false;
        });
    });

    refresh(initialViewport);
  }
})();
