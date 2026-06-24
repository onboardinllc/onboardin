/** Pure canvas helpers for signature drawing and PNG export. No Supabase. */

export const SIGNATURE_CANVAS_DEFAULTS = {
  width: 600,
  height: 140,
  strokeColor: '#e5e7eb',
  strokeWidth: 2.5,
};

/** Max dimensions enforced by validatePngFile in member-signature.js */
export const SIGNATURE_EXPORT_MAX_WIDTH = 2000;
export const SIGNATURE_EXPORT_MAX_HEIGHT = 800;

/**
 * Apply DPR scaling so strokes are crisp on retina screens.
 * Returns the 2D context ready to draw.
 */
export function createSignatureCanvasContext(canvas, options = {}) {
  const { strokeColor = SIGNATURE_CANVAS_DEFAULTS.strokeColor } = options;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = SIGNATURE_CANVAS_DEFAULTS.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.clearRect(0, 0, rect.width, rect.height);
  return ctx;
}

/**
 * Resolve ctx from a context object or getter (supports ref-based binding).
 */
function resolveCtx(ctxOrGetter) {
  if (typeof ctxOrGetter === 'function') return ctxOrGetter();
  return ctxOrGetter;
}

/**
 * Paint a single-point tap as a filled dot (zero-length strokes are invisible).
 */
function paintTapDot(ctx, x, y) {
  const r = Math.max(ctx.lineWidth / 2, 1);
  ctx.beginPath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Attach pointer-based drawing to a canvas element.
 * ctxOrGetter: CanvasRenderingContext2D or () => ctx — use getter when context may be re-created.
 * Sets touch-action: none on the canvas to prevent scroll interference.
 * Returns a cleanup() function — call it in useEffect return.
 */
export function bindSignaturePointerDrawing(canvas, ctxOrGetter, { onStrokeStart, onStrokeMove, onStrokeEnd } = {}) {
  canvas.style.touchAction = 'none';
  let drawing = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let activePointerId = null;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function releaseCapture(e) {
    if (activePointerId != null && canvas.hasPointerCapture(activePointerId)) {
      try { canvas.releasePointerCapture(activePointerId); } catch { /* already released */ }
    }
    activePointerId = null;
  }

  function start(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const ctx = resolveCtx(ctxOrGetter);
    if (!ctx) return;
    e.preventDefault();
    drawing = true;
    moved = false;
    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const { x, y } = getPos(e);
    lastX = x;
    lastY = y;
    ctx.beginPath();
    ctx.moveTo(x, y);
    onStrokeStart?.();
  }

  function move(e) {
    if (!drawing || (activePointerId != null && e.pointerId !== activePointerId)) return;
    const ctx = resolveCtx(ctxOrGetter);
    if (!ctx) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    moved = true;
    lastX = x;
    lastY = y;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    onStrokeMove?.();
  }

  function end(e) {
    if (!drawing || (activePointerId != null && e.pointerId !== activePointerId)) return;
    const ctx = resolveCtx(ctxOrGetter);
    if (!ctx) return;
    e.preventDefault();
    drawing = false;
    if (!moved) paintTapDot(ctx, lastX, lastY);
    ctx.beginPath();
    releaseCapture(e);
    onStrokeEnd?.();
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return function cleanup() {
    canvas.removeEventListener('pointerdown', start);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointercancel', end);
    releaseCapture({ pointerId: activePointerId });
  };
}

/**
 * Returns true if any pixel on the canvas has non-zero alpha — i.e., something was drawn.
 * threshold: minimum number of non-transparent pixels required (default 1).
 */
export function canvasHasInk(canvas, ctx, threshold = 1) {
  const { width, height } = canvas;
  if (!width || !height) return false;
  const data = ctx.getImageData(0, 0, width, height).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      count++;
      if (count >= threshold) return true;
    }
  }
  return false;
}

/**
 * Export canvas contents as a PNG Blob.
 * Scales down if needed to stay within validatePngFile dimension limits.
 * maxBytes: optional size cap in bytes (default 512 KB).
 */
export function exportCanvasToPngBlob(canvas, { maxBytes = 512 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let exportCanvas = canvas;
    const scale = Math.min(
      1,
      SIGNATURE_EXPORT_MAX_WIDTH / canvas.width,
      SIGNATURE_EXPORT_MAX_HEIGHT / canvas.height,
    );
    if (scale < 1) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
      exportCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
      const ex = exportCanvas.getContext('2d');
      ex.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas export failed.')); return; }
      if (blob.size > maxBytes) {
        reject(new Error(`Signature PNG too large (${blob.size} bytes). Max ${maxBytes} bytes.`));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Wrap a Blob in a File with image/png type.
 * The resulting File passes validatePngFile (magic bytes come from toBlob).
 */
export function pngBlobToFile(blob, filename = 'signature.png') {
  return new File([blob], filename, { type: 'image/png' });
}