/* Game-mode render-quality ladder: pure, DOM-free, deterministic. game.js owns
   every side effect (canvases, storage, events); this file only answers "which
   tier next" and "what does a tier mean". No timers, no clocks, no globals. */

export const TIER_STORAGE_KEY = 'race.game.tier';
export const LITE_TIER = 4;          // not WebGL: the Lite SVG
export const LOWEST_WEBGL_TIER = 3;
export const MAX_ATTEMPTS = 4;       // per entry; then Lite

/* Framebuffer model, bytes per drawing-buffer pixel. Plain: RGBA8 colour (4)
   + packed DEPTH24_STENCIL8 (4) = 8. MSAA at the browsers' usual 4 samples: a
   multisampled colour renderbuffer (4 x 4 = 16) + a multisampled depth/stencil
   renderbuffer (4 x 4 = 16) + the single-sample resolve colour target (4) =
   36. An estimate of what the driver may allocate, not a measurement. */
export const BYTES_PER_PIXEL_PLAIN = 8;
export const BYTES_PER_PIXEL_MSAA = 36;

const MIB = 1024 * 1024;
export const MIN_RATIO = 0.5;

export function framebufferBytes(width, height, antialias) {
  return Math.round(width * height * (antialias ? BYTES_PER_PIXEL_MSAA : BYTES_PER_PIXEL_PLAIN));
}

/* What the renderer reported -> a budget class for the MSAA-sized framebuffer.
   The per-dimension limits are the only numbers a WebGL context exposes about
   the GPU; they do not separate a phone from a desktop (both report 16384), so
   the class only *lowers* the budget for hardware that reports less, or that
   positively identifies as a software rasteriser. A masked or missing renderer
   string (iOS Safari reports "Apple GPU"; some browsers withhold it) is
   "unknown" and never counts as weak. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function dimensionLimit(limits) {
  if (!limits) return Infinity;
  const values = [limits.maxRenderbufferSize, limits.maxTextureSize]
    .concat(Array.isArray(limits.maxViewportDims) ? limits.maxViewportDims : [])
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : Infinity;
}

export function memoryClass(limits) {
  if (limits && typeof limits.renderer === 'string' && SOFTWARE_RENDERER.test(limits.renderer)) {
    return { name: 'software', budgetBytes: 32 * MIB };
  }
  const dim = dimensionLimit(limits);
  if (!Number.isFinite(dim)) return { name: 'unknown', budgetBytes: 64 * MIB };
  if (dim >= 16384) return { name: 'high', budgetBytes: 128 * MIB };
  if (dim >= 8192) return { name: 'mid', budgetBytes: 64 * MIB };
  return { name: 'low', budgetBytes: 32 * MIB };
}

/* The device-derived ratio cap shared by tiers 0-2 (tier 3 is 1). Largest
   ratio <= devicePixelRatio such that (a) neither drawing-buffer dimension
   exceeds the smallest reported dimension limit and (b) the MSAA framebuffer
   estimate stays inside the class budget. Never below MIN_RATIO. */
export function ratioCap({ cssWidth, cssHeight, dpr, limits }) {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const nativeRatio = Math.max(1, dpr || 1);
  const budgetPixels = memoryClass(limits).budgetBytes / BYTES_PER_PIXEL_MSAA;
  const budgetRatio = Math.sqrt(budgetPixels / (w * h));
  const dimRatio = dimensionLimit(limits) / Math.max(w, h);
  return Math.max(MIN_RATIO, Math.min(nativeRatio, budgetRatio, dimRatio));
}

/* One complete renderer configuration per tier. Tier 3 is min(1, cap), not a
   flat 1, so an oversized viewport (cap < 1) can never make the last resort
   heavier than tier 0. */
export function tierConfig(tier, cap) {
  switch (tier) {
    case 0: return { ratio: cap, antialias: true };
    case 1: return { ratio: cap, antialias: false };
    case 2: return { ratio: Math.min(2, cap), antialias: false };
    case 3: return { ratio: Math.min(1, cap), antialias: false };
    default: return null;
  }
}

export function parseStoredTier(raw) {
  if (typeof raw !== 'string' || !/^[0-3]$/.test(raw)) return null;
  return Number(raw);
}

/* Weak-device hints can only choose a lower *start*; nothing here prevents a
   tier from being tried, and a stored survival always wins over a hint. */
export function hintTier(hints) {
  const memory = hints && Number(hints.deviceMemory);
  const cores = hints && Number(hints.hardwareConcurrency);
  let tier = 0;
  if (Number.isFinite(memory) && memory > 0) {
    if (memory <= 1) tier = Math.max(tier, 3);
    else if (memory <= 2) tier = Math.max(tier, 2);
    else if (memory <= 4) tier = Math.max(tier, 1);
  }
  if (Number.isFinite(cores) && cores > 0) {
    if (cores <= 2) tier = Math.max(tier, 2);
    else if (cores <= 4) tier = Math.max(tier, 1);
  }
  return tier;
}

export function startTier({ stored, hints }) {
  return stored === null || stored === undefined ? hintTier(hints) : stored;
}

/* Outcomes:
   'start'               first decision of an entry
   'survived'|'restored' keep the tier
   'threw'               construction threw
   'lost-on-create'      isContextLost() was already true right after build
   'lost-before-render'  loss event before the user ever travelled in 3D
   'lost-after-render'   loss event after frames the user drove
   Returns { action: 'build'|'keep'|'park'|'lite', tier, persist }.
   `tier` is the tier to (re)build at; `persist` the integer to store (or null). */
export function nextTier({ stored = null, hints = null, tier = 0, outcome, attempts = 0, postRenderLosses = 0 }) {
  const step = () => {
    const lower = tier + 1;
    if (lower > LOWEST_WEBGL_TIER || attempts >= MAX_ATTEMPTS) {
      return { action: 'lite', tier: LITE_TIER, persist: LOWEST_WEBGL_TIER };
    }
    return { action: 'build', tier: lower, persist: lower };
  };
  switch (outcome) {
    case 'start': {
      const start = startTier({ stored, hints });
      return { action: 'build', tier: start, persist: null };
    }
    case 'survived':
    case 'restored':
      return { action: 'keep', tier, persist: tier };
    case 'threw':
    case 'lost-on-create':
    case 'lost-before-render':
      return step();
    case 'lost-after-render': {
      if (postRenderLosses >= 1) return step();
      const lower = Math.min(tier + 1, LOWEST_WEBGL_TIER);
      return { action: 'park', tier: lower, persist: lower };
    }
    default:
      throw new Error(`unknown outcome: ${outcome}`);
  }
}

export function classifyLoss(userFrames) {
  return userFrames > 0 ? 'lost-after-render' : 'lost-before-render';
}
