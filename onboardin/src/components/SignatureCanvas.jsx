import { useRef, useEffect, useState, useCallback } from 'react';
import {
  createSignatureCanvasContext,
  bindSignaturePointerDrawing,
  canvasHasInk,
  exportCanvasToPngBlob,
  pngBlobToFile,
} from '../lib/signature-canvas-export';

const RESIZE_DEBOUNCE_MS = 150;
const RESIZE_THRESHOLD_PX = 4;

/**
 * Draw-only signature canvas. Calls onExport(file) with a PNG File - parent handles upload.
 *
 * compact=false (Overview): height ~140, full labels
 * compact=true  (Overlay):  height ~100, tighter chrome
 */
export default function SignatureCanvas({
  onExport,
  compact = false,
  disabled = false,
  height,
  className = '',
  onCancel,
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const hasInkRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [hasInk, setHasInk] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const canvasHeight = height ?? (compact ? 100 : 140);

  const syncHasInk = useCallback((value) => {
    hasInkRef.current = value;
    setHasInk(value);
  }, []);

  const getCtx = useCallback(() => ctxRef.current, []);

  const initCanvas = useCallback((resetInk = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    sizeRef.current = { width: rect.width, height: rect.height };
    const ctx = createSignatureCanvasContext(canvas);
    ctxRef.current = ctx;
    if (resetInk) syncHasInk(false);
  }, [syncHasInk]);

  const refreshHasInk = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    syncHasInk(canvasHasInk(canvas, ctx));
  }, [syncHasInk]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    initCanvas(true);
    const cleanup = bindSignaturePointerDrawing(canvas, getCtx, {
      onStrokeMove: () => {
        if (!hasInkRef.current) syncHasInk(true);
      },
      onStrokeEnd: refreshHasInk,
    });
    return cleanup;
  }, [initCanvas, disabled, getCtx, refreshHasInk, syncHasInk]);

  // Re-init only on meaningful empty-canvas resize (orientation / panel width)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const rect = canvas.getBoundingClientRect();
        const prev = sizeRef.current;
        const dw = Math.abs(rect.width - prev.width);
        const dh = Math.abs(rect.height - prev.height);
        if (dw < RESIZE_THRESHOLD_PX && dh < RESIZE_THRESHOLD_PX) return;
        if (hasInkRef.current) return;
        initCanvas(true);
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(canvas);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [initCanvas]);

  const handleClear = () => {
    initCanvas(true);
    setExportError('');
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || exporting || disabled) return;
    setExporting(true);
    setExportError('');
    try {
      const blob = await exportCanvasToPngBlob(canvas);
      const file = pngBlobToFile(blob);
      await onExport(file);
    } catch (e) {
      setExportError(e.message || 'Export failed.');
    }
    setExporting(false);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        className="relative rounded-lg border border-white/10 bg-white/5 overflow-hidden"
        style={{ height: canvasHeight, touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        />
        {!hasInk && !disabled && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 pointer-events-none select-none">
            {compact ? 'Draw your signature' : 'Draw your signature here'}
          </span>
        )}
        {disabled && (
          <div className="absolute inset-0 bg-black/20 rounded-lg" />
        )}
      </div>

      <div className={`flex items-center gap-3 ${compact ? '' : 'mt-1'}`}>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || !hasInk || exporting}
          className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || !hasInk || exporting}
          className={`
            flex-1 py-2 rounded-lg border border-white/10 bg-white/5
            text-xs uppercase tracking-widest text-gray-300
            hover:bg-white/10 hover:border-white/20 transition-all
            disabled:opacity-30 disabled:cursor-not-allowed
            ${compact ? '' : 'py-2.5'}
          `}
        >
          {exporting ? 'Saving…' : 'Save signature'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled || exporting}
            className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
          >
            Cancel
          </button>
        )}
      </div>

      {exportError && (
        <p className="text-sm text-red-300">{exportError}</p>
      )}
    </div>
  );
}