/* Optional course illumination. Native scrolling, no dependencies, no idle loop.
   The document and anchors are the source of truth; no biography is stored here. */
(() => {
  'use strict';
  const main = document.querySelector('#race-main');
  const progress = document.querySelector('.race-progress');
  const readout = document.querySelector('.race-readout');
  if (!main || !progress || !readout) return;

  const stages = [...main.querySelectorAll('.race-stage')];
  const links = [...document.querySelectorAll('.race-nav a')];
  const percent = readout.querySelector('[data-race-progress]');
  const coordinates = readout.querySelector('[data-race-coordinates]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let layout = [];
  let top = 0;
  let height = 0;
  let dirty = true;
  let active = '';

  function draw() {
    frame = 0;
    // Read all geometry before writing styles; scroll frames use cached offsets.
    const y = window.scrollY;
    if (dirty) {
      const rect = main.getBoundingClientRect();
      top = rect.top + y;
      height = rect.height;
      layout = stages.map(stage => ({
        id: stage.id,
        top: stage.getBoundingClientRect().top + y,
        coordinates: stage.dataset.coordinates || '',
      }));
      dirty = false;
    }
    const probe = y + window.innerHeight * 0.4;
    const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const fraction = atEnd ? 1 : Math.max(0, Math.min(1, (probe - top) / height));
    const current = layout.reduce((found, stage) => stage.top <= probe ? stage : found, layout[0]);
    if (motion.matches) {
      progress.style.removeProperty('stroke-dasharray');
      progress.style.removeProperty('stroke-dashoffset');
      readout.classList.remove('race-readout--live');
      readout.hidden = true;
    } else {
      progress.style.strokeDasharray = '1';
      progress.style.strokeDashoffset = String(1 - fraction);
      percent.textContent = `${Math.round(fraction * 100).toString().padStart(2, '0')}%`;
      coordinates.textContent = current.coordinates;
      readout.classList.add('race-readout--live');
      readout.hidden = false;
    }
    if (current.id !== active) {
      links.forEach(link => {
        if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      active = current.id;
    }
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function remeasure() { dirty = true; schedule(); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('pageshow', remeasure);
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(main);
  if (document.fonts) document.fonts.ready.then(remeasure);
  schedule();
})();
