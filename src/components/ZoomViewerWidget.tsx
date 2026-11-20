import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eraser,
  Trash2,
  PenTool,
  Undo2,
  Redo2,
  Palette,
  Eye,
  Radio,
  AlertTriangle
} from 'lucide-react';
import type {
  WhiteboardStrokePayload,
  WhiteboardStrokePoint,
  WhiteboardSyncEvent
} from '../lib/meetingService';

interface Props {
  language: 'en' | 'ar' | 'fr';
  onClose?: () => void;
  isEmbedded?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  canDraw?: boolean;
  isTutor?: boolean;
  onBroadcastEvent?: (event: WhiteboardSyncEvent) => Promise<boolean> | void;
  incomingSyncEvent?: WhiteboardSyncEvent | null;
  onCanvasStreamReady?: (stream: MediaStream | null) => void;
  isStreamingCanvas?: boolean;
  onToggleStreamCanvas?: () => void;
}

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 800;

const PRESET_COLORS = [
  { hex: '#0F172A', label: 'Ink Black' },
  { hex: '#2563EB', label: 'Primary Blue' },
  { hex: '#DC2626', label: 'Crimson Red' },
  { hex: '#059669', label: 'Emerald Green' },
  { hex: '#D97706', label: 'Amber' },
  { hex: '#7C3AED', label: 'Violet' },
  { hex: '#DB2777', label: 'Rose' },
  { hex: '#0D9488', label: 'Teal' }
];

const PEN_SIZE_PRESETS = [2, 5, 10, 16];
const ERASER_SIZE_PRESETS = [10, 18, 28, 40];

/**
 * Draws a single stroke smoothly using quadratic Bezier midpoint interpolation
 * onto a canvas context already scaled to logical board coordinates.
 */
function drawSmoothStroke(ctx: CanvasRenderingContext2D, stroke: WhiteboardStrokePayload) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  const isErase = stroke.mode === 'erase';
  ctx.strokeStyle = isErase ? '#FFFFFF' : stroke.color;
  ctx.fillStyle = isErase ? '#FFFFFF' : stroke.color;
  ctx.lineWidth = Math.max(1, stroke.width);

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, Math.max(1, stroke.width) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

export default function ZoomViewerWidget({
  language,
  onClose,
  isEmbedded = false,
  currentUserId = 'local-user',
  canDraw = false,
  isTutor = false,
  onBroadcastEvent,
  incomingSyncEvent,
  onCanvasStreamReady,
  isStreamingCanvas = false,
  onToggleStreamCanvas
}: Props) {
  const t = (en: string, ar: string, fr?: string) =>
    language === 'ar' ? ar : language === 'fr' ? fr || en : en;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [penColor, setPenColor] = useState('#0F172A');
  const [penWidth, setPenWidth] = useState(4);
  const [eraserWidth, setEraserWidth] = useState(18);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Stroke history (supports smooth high-DPI redraws + Undo/Redo + realtime sync)
  const [strokes, setStrokes] = useState<WhiteboardStrokePayload[]>([]);
  const [redoStack, setRedoStack] = useState<WhiteboardStrokePayload[]>([]);

  const strokesRef = useRef<WhiteboardStrokePayload[]>([]);
  const activeStrokeRef = useRef<WhiteboardStrokePayload | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // Abort any in-progress stroke immediately if drawing permission is revoked
  useEffect(() => {
    if (!canDraw && activeStrokeRef.current) {
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      redrawCanvas();
    }
  }, [canDraw]);

  const updateCompositeCanvas = useCallback(() => {
    const comp = compositeCanvasRef.current;
    if (!comp) return;
    const ctx = comp.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, comp.width, comp.height);
    for (const s of strokesRef.current) {
      drawSmoothStroke(ctx, s);
    }
    if (activeStrokeRef.current) {
      drawSmoothStroke(ctx, activeStrokeRef.current);
    }
    ctx.restore();
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(LOGICAL_WIDTH * dpr);
    const targetH = Math.round(LOGICAL_HEIGHT * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    for (const s of strokesRef.current) {
      drawSmoothStroke(ctx, s);
    }
    if (activeStrokeRef.current) {
      drawSmoothStroke(ctx, activeStrokeRef.current);
    }
    ctx.restore();

    updateCompositeCanvas();
  }, [updateCompositeCanvas]);

  // Redraw whenever strokes state changes
  useEffect(() => {
    redrawCanvas();
  }, [strokes, redrawCanvas]);

  // Expose pure-white composite canvas stream for WebRTC board streaming
  useEffect(() => {
    if (!onCanvasStreamReady || !compositeCanvasRef.current) return;
    try {
      const comp = compositeCanvasRef.current;
      updateCompositeCanvas();
      if (typeof comp.captureStream === 'function') {
        const stream = comp.captureStream(25);
        onCanvasStreamReady(stream);
      }
    } catch (_) {
      onCanvasStreamReady(null);
    }
  }, [onCanvasStreamReady, updateCompositeCanvas]);

  // Apply incoming realtime whiteboard events from teacher / authorized drawer
  useEffect(() => {
    if (!incomingSyncEvent) return;

    if (incomingSyncEvent.type === 'sync-history') {
      setStrokes(incomingSyncEvent.strokes);
      setRedoStack([]);
    } else if (incomingSyncEvent.type === 'stroke') {
      const incoming = incomingSyncEvent.stroke;
      setStrokes((prev) => {
        if (prev.some((s) => s.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
    } else if (incomingSyncEvent.type === 'undo') {
      const targetId = incomingSyncEvent.strokeId;
      setStrokes((prev) => {
        const found = prev.find((s) => s.id === targetId);
        if (!found) return prev;
        setRedoStack((r) => (r.some((x) => x.id === found.id) ? r : [...r, found]));
        return prev.filter((s) => s.id !== targetId);
      });
    } else if (incomingSyncEvent.type === 'redo') {
      const targetId = incomingSyncEvent.strokeId;
      setRedoStack((prevRedo) => {
        const found = prevRedo.find((s) => s.id === targetId);
        if (!found) return prevRedo;
        setStrokes((s) => (s.some((x) => x.id === found.id) ? s : [...s, found]));
        return prevRedo.filter((s) => s.id !== targetId);
      });
    } else if (incomingSyncEvent.type === 'clear') {
      setStrokes([]);
      setRedoStack([]);
    }
  }, [incomingSyncEvent]);

  const handleUndo = useCallback(() => {
    if (!canDraw) return;
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      onBroadcastEvent?.({
        type: 'undo',
        strokeId: last.id,
        senderId: currentUserId
      });
      return prev.slice(0, -1);
    });
  }, [canDraw, currentUserId, onBroadcastEvent]);

  const handleRedo = useCallback(() => {
    if (!canDraw) return;
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const restored = prevRedo[prevRedo.length - 1];
      setStrokes((s) => (s.some((x) => x.id === restored.id) ? s : [...s, restored]));
      onBroadcastEvent?.({
        type: 'redo',
        strokeId: restored.id,
        senderId: currentUserId
      });
      return prevRedo.slice(0, -1);
    });
  }, [canDraw, currentUserId, onBroadcastEvent]);

  // Keyboard shortcuts for Undo / Redo when drawing is enabled
  useEffect(() => {
    if (!canDraw) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canDraw, handleUndo, handleRedo]);

  const getLogicalPoint = (clientX: number, clientY: number): WhiteboardStrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  };

  const scheduleRedraw = () => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      redrawCanvas();
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    const pt = getLogicalPoint(e.clientX, e.clientY);
    if (!pt) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    activePointerIdRef.current = e.pointerId;
    const strokeId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    activeStrokeRef.current = {
      id: strokeId,
      mode: tool,
      color: tool === 'erase' ? '#FFFFFF' : penColor,
      width: tool === 'erase' ? eraserWidth : penWidth,
      points: [pt],
      senderId: currentUserId
    };

    scheduleRedraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !activeStrokeRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    e.preventDefault();

    // Use coalesced pointer events where available for ultra-smooth stylus/touch input
    const nativeEvt = e.nativeEvent as PointerEvent;
    const coalesced =
      typeof nativeEvt.getCoalescedEvents === 'function' ? nativeEvt.getCoalescedEvents() : [nativeEvt];

    const pts = activeStrokeRef.current.points;
    let added = false;
    for (const ev of coalesced) {
      const pt = getLogicalPoint(ev.clientX, ev.clientY);
      if (!pt) continue;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.5) {
        pts.push(pt);
        added = true;
      }
    }

    if (added) {
      scheduleRedraw();
    }
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;

    if (!canDraw || finished.points.length === 0) {
      redrawCanvas();
      return;
    }

    // Optimistically add stroke & clear redo branch, then persist & broadcast (server RLS verified)
    setStrokes((prev) => [...prev, finished]);
    setRedoStack([]);

    Promise.resolve(
      onBroadcastEvent?.({
        type: 'stroke',
        stroke: finished
      })
    ).then((ok) => {
      if (ok === false) {
        // Server RLS rejected unauthorized stroke — roll back local state
        setStrokes((prev) => prev.filter((s) => s.id !== finished.id));
      }
    });
  };

  const confirmClearBoard = () => {
    if (!canDraw) return;
    setShowClearConfirm(false);
    setStrokes([]);
    setRedoStack([]);
    onBroadcastEvent?.({
      type: 'clear',
      senderId: currentUserId
    });
  };

  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.2).toFixed(2)), 2.5));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.2).toFixed(2)), 0.6));
  const handleResetZoom = () => setScale(1);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const activeSize = tool === 'erase' ? eraserWidth : penWidth;

  return (
    <div
      ref={containerRef}
      className={`bg-white flex flex-col text-slate-900 font-sans select-none overflow-hidden relative ${
        isEmbedded
          ? 'w-full h-full min-h-[340px] rounded-2xl border border-slate-200 shadow-sm'
          : 'fixed inset-0 z-50'
      }`}
    >
      {/* Hidden pure-white composite canvas for WebRTC captureStream */}
      <canvas ref={compositeCanvasRef} width={LOGICAL_WIDTH} height={LOGICAL_HEIGHT} className="hidden" />

      {/* Top Whiteboard Bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <PenTool className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {t('Whiteboard', 'السبورة التفاعلية', 'Tableau blanc')}
              </h2>
              {canDraw ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {isTutor
                    ? t('Host Control', 'تحكم الأستاذ', 'Contrôle prof')
                    : t('Drawing Enabled', 'الرسم مفعّل لك', 'Dessin autorisé')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                  <Eye className="w-3 h-3 text-slate-500" />
                  {t('View only', 'للعرض فقط', 'Lecture seule')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls: Drawing Tools (ONLY if canDraw) + View Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {canDraw && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTool('draw')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  tool === 'draw'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
                title={t('Pen Tool', 'أداة القلم', 'Stylo')}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('Pen', 'قلم', 'Stylo')}</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('erase')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  tool === 'erase'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
                title={t('Eraser', 'الممحاة', 'Gomme')}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('Eraser', 'ممحاة', 'Gomme')}</span>
              </button>

              <div className="w-px h-5 bg-slate-200 mx-0.5" />

              <button
                type="button"
                onClick={handleUndo}
                disabled={strokes.length === 0}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-all"
                title={t('Undo (Ctrl+Z)', 'تراجع', 'Annuler')}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:pointer-events-none transition-all"
                title={t('Redo (Ctrl+Y)', 'إعادة', 'Rétablir')}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-5 bg-slate-200 mx-0.5" />

              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={strokes.length === 0}
                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-35 disabled:pointer-events-none transition-all"
                title={t('Clear All', 'مسح الكل', 'Tout effacer')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Non-mutating Zoom & Fullscreen View Controls */}
          <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
              title={t('Zoom Out', 'تصغير', 'Dézoomer')}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-bold font-mono text-slate-700 px-1 min-w-[38px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
              title={t('Zoom In', 'تكبير', 'Zoomer')}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
              title={t('Reset Zoom', 'إعادة الضبط', 'Réinitialiser')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {isTutor && onToggleStreamCanvas && (
              <>
                <div className="w-px h-5 bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={onToggleStreamCanvas}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    isStreamingCanvas
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:bg-white hover:text-blue-600'
                  }`}
                  title={t('Broadcast Board as Video Stream', 'بث السبورة كفيديو مباشر')}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">
                    {isStreamingCanvas ? t('Streaming', 'جاري البث') : t('Stream', 'بث')}
                  </span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
              title={t('Toggle Fullscreen', 'ملء الشاشة', 'Plein écran')}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {onClose && !isEmbedded && (
              <button
                type="button"
                onClick={onClose}
                className="ml-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all"
              >
                {t('Close', 'إغلاق', 'Fermer')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pen / Eraser Customization Sub-bar (VISIBLE ONLY when canDraw === true) */}
      {canDraw && (
        <div className="bg-slate-50/90 border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-3 z-20">
          {tool === 'draw' ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                {t('Color', 'اللون', 'Couleur')}
              </span>
              {PRESET_COLORS.map((c) => {
                const isSelected = penColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setPenColor(c.hex)}
                    aria-label={c.label}
                    className={`w-6 h-6 rounded-full transition-all flex items-center justify-center ${
                      isSelected
                        ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-50 scale-105'
                        : 'border border-slate-300/80 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}

              {/* Custom Color Picker */}
              <div className="relative ml-1">
                <input
                  ref={customColorInputRef}
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  className="sr-only"
                  aria-label={t('Custom color', 'لون مخصص', 'Couleur personnalisée')}
                />
                <button
                  type="button"
                  onClick={() => customColorInputRef.current?.click()}
                  className="h-7 px-2 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                  title={t('Custom Color', 'لون مخصص', 'Couleur personnalisée')}
                >
                  <Palette className="w-3.5 h-3.5 text-blue-600" />
                  <span
                    className="w-3 h-3 rounded-full border border-slate-300"
                    style={{ backgroundColor: penColor }}
                  />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Eraser className="w-4 h-4 text-blue-600" />
              <span>{t('Eraser Mode — Drag to erase strokes', 'وضع الممحاة — اسحب لمسح الخطوط', 'Mode gomme')}</span>
            </div>
          )}

          {/* Stroke / Eraser Thickness Slider + Presets + Live Size Preview */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500">
              {tool === 'erase' ? t('Eraser size', 'حجم الممحاة', 'Taille') : t('Size', 'السماكة', 'Épaisseur')}
            </span>

            <div className="flex items-center gap-1">
              {(tool === 'erase' ? ERASER_SIZE_PRESETS : PEN_SIZE_PRESETS).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => (tool === 'erase' ? setEraserWidth(preset) : setPenWidth(preset))}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border ${
                    activeSize === preset
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                  title={`${preset}px`}
                >
                  <span
                    className="rounded-full"
                    style={{
                      width: `${Math.min(18, Math.max(4, tool === 'erase' ? preset / 2.2 : preset))}px`,
                      height: `${Math.min(18, Math.max(4, tool === 'erase' ? preset / 2.2 : preset))}px`,
                      backgroundColor: tool === 'erase' ? '#CBD5E1' : penColor
                    }}
                  />
                </button>
              ))}
            </div>

            <input
              type="range"
              min={tool === 'erase' ? 6 : 1}
              max={tool === 'erase' ? 40 : 20}
              value={activeSize}
              onChange={(e) =>
                tool === 'erase' ? setEraserWidth(Number(e.target.value)) : setPenWidth(Number(e.target.value))
              }
              className="w-24 sm:w-28 accent-blue-600 cursor-pointer"
            />

            {/* Live Stroke Preview Chip */}
            <div
              className="h-7 px-2 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5"
              title={t('Live stroke preview', 'معاينة حجم الخط')}
            >
              <span
                className="rounded-full border border-slate-300/70 transition-all"
                style={{
                  width: `${Math.min(18, Math.max(3, tool === 'erase' ? activeSize / 2 : activeSize))}px`,
                  height: `${Math.min(18, Math.max(3, tool === 'erase' ? activeSize / 2 : activeSize))}px`,
                  backgroundColor: tool === 'erase' ? '#FFFFFF' : penColor
                }}
              />
              <span className="text-[11px] font-mono font-semibold text-slate-600 min-w-[28px]">
                {activeSize}px
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Pure White Drawing Stage */}
      <div className="flex-1 relative overflow-auto bg-slate-100/70 flex items-center justify-center p-2 sm:p-4">
        <div
          className="relative bg-white rounded-xl border border-slate-200/90 shadow-md overflow-hidden transition-transform duration-100 ease-out"
          style={{
            width: '100%',
            maxWidth: `${Math.round(960 * scale)}px`,
            aspectRatio: `${LOGICAL_WIDTH} / ${LOGICAL_HEIGHT}`
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            style={{ touchAction: 'none' }}
            className={`w-full h-full block bg-white ${
              canDraw
                ? tool === 'erase'
                  ? 'cursor-cell pointer-events-auto'
                  : 'cursor-crosshair pointer-events-auto'
                : 'cursor-default pointer-events-none'
            }`}
          />
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && canDraw && (
        <div className="absolute inset-0 z-40 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xs w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('Clear Whiteboard?', 'مسح السبورة بالكامل؟', 'Effacer le tableau ?')}
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t(
                    'This will remove all drawings on the board for everyone in the session.',
                    'سيؤدي هذا إلى مسح جميع الرسومات على السبورة لدى الجميع في الحصة.',
                    'Cela supprimera tous les dessins pour tous les participants.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                {t('Cancel', 'إلغاء', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={confirmClearBoard}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors"
              >
                {t('Clear Board', 'مسح السبورة', 'Effacer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
