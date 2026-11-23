import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Scan,
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
  AlertTriangle,
  Hand,
  MousePointer2,
  ImagePlus,
  Type,
  RotateCw,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Loader2,
  Check,
  X
} from 'lucide-react';
import {
  compressAndUploadWhiteboardImage,
  getWhiteboardMediaSignedUrl,
  type WhiteboardObjectPayload,
  type WhiteboardStrokePayload,
  type WhiteboardStrokePoint,
  type WhiteboardSyncEvent
} from '../lib/meetingService';

interface Props {
  roomId?: string;
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

type ToolMode = 'select' | 'hand' | 'draw' | 'erase' | 'text';

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
const ERASER_SIZE_PRESETS = [12, 22, 34, 48];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4.0;

function genId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

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
  roomId = 'default-room',
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
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  // Active tool & styling
  const [tool, setTool] = useState<ToolMode>(canDraw ? 'draw' : 'hand');
  const [penColor, setPenColor] = useState('#0F172A');
  const [penWidth, setPenWidth] = useState(4);
  const [eraserWidth, setEraserWidth] = useState(22);
  const [openPopover, setOpenPopover] = useState<'none' | 'color' | 'size'>('none');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Infinite camera state: world -> screen: sx = wx * zoom + x
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Board content state
  const [strokes, setStrokes] = useState<WhiteboardStrokePayload[]>([]);
  const [redoStack, setRedoStack] = useState<WhiteboardStrokePayload[]>([]);
  const [objects, setObjects] = useState<WhiteboardObjectPayload[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<{
    id?: string;
    worldX: number;
    worldY: number;
    value: string;
  } | null>(null);

  const strokesRef = useRef<WhiteboardStrokePayload[]>([]);
  const objectsRef = useRef<WhiteboardObjectPayload[]>([]);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const activeStrokeRef = useRef<WhiteboardStrokePayload | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const spacePressedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastEphemeralBroadcastRef = useRef<number>(0);

  // Multi-touch pan / pinch tracking
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    camX: number;
    camY: number;
    camZoom: number;
  } | null>(null);

  // Single-pointer pan / object manipulation tracking
  const dragActionRef = useRef<
    | null
    | { kind: 'pan'; startX: number; startY: number; camX: number; camY: number }
    | {
        kind: 'move-obj';
        objId: string;
        startWorldX: number;
        startWorldY: number;
        origX: number;
        origY: number;
      }
    | {
        kind: 'resize-obj';
        objId: string;
        startWorldX: number;
        startWorldY: number;
        origW: number;
        origH: number;
        aspect: number;
      }
    | {
        kind: 'rotate-obj';
        objId: string;
        centerX: number;
        centerY: number;
        startAngle: number;
        origRot: number;
      }
  >(null);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Switch to hand tool if drawing permission is revoked
  useEffect(() => {
    if (!canDraw) {
      if (activeStrokeRef.current) {
        activeStrokeRef.current = null;
        activePointerIdRef.current = null;
      }
      setSelectedObjectId(null);
      setEditingText(null);
      setOpenPopover('none');
      setTool('hand');
    } else if (tool === 'hand' && isTutor) {
      setTool('draw');
    }
  }, [canDraw, isTutor]);

  const screenToWorld = useCallback((clientX: number, clientY: number): WhiteboardStrokePoint => {
    const canvas = canvasRef.current;
    const cam = cameraRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: Math.round(((sx - cam.x) / cam.zoom) * 10) / 10,
      y: Math.round(((sy - cam.y) / cam.zoom) * 10) / 10
    };
  }, []);

  const drawObjectOnCtx = useCallback(
    (ctx: CanvasRenderingContext2D, obj: WhiteboardObjectPayload) => {
      ctx.save();
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;
      ctx.translate(cx, cy);
      if (obj.rotation) {
        ctx.rotate((obj.rotation * Math.PI) / 180);
      }

      if (obj.kind === 'image') {
        const url = obj.signedUrl || '';
        const cached = url ? imageCacheRef.current.get(url) : undefined;
        if (cached && cached.complete && cached.naturalWidth > 0) {
          ctx.drawImage(cached, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
        } else {
          ctx.fillStyle = '#F8FAFC';
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 1.5;
          ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
          ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        }
      } else if (obj.kind === 'text' && obj.textContent) {
        const fontSize = obj.fontSize || 22;
        ctx.font = `600 ${fontSize}px Inter, Cairo, sans-serif`;
        ctx.fillStyle = obj.color || '#0F172A';
        ctx.textBaseline = 'top';
        const lines = String(obj.textContent).split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, -obj.width / 2 + 4, -obj.height / 2 + 4 + idx * fontSize * 1.3);
        });
      }
      ctx.restore();
    },
    []
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const cam = cameraRef.current;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Pure white infinite background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);

    // Subtle infinite dot grid that moves with camera for spatial orientation
    const gridSpacing = 40 * cam.zoom;
    if (gridSpacing >= 14) {
      const startX = ((cam.x % gridSpacing) + gridSpacing) % gridSpacing;
      const startY = ((cam.y % gridSpacing) + gridSpacing) % gridSpacing;
      ctx.fillStyle = '#E2E8F0';
      for (let gx = startX; gx < cssW; gx += gridSpacing) {
        for (let gy = startY; gy < cssH; gy += gridSpacing) {
          ctx.fillRect(gx, gy, 1.2, 1.2);
        }
      }
    }

    // Apply infinite world transform
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    // 1. Render layered images & text objects sorted by zIndex
    const sortedObjects = [...objectsRef.current].sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1));
    for (const obj of sortedObjects) {
      drawObjectOnCtx(ctx, obj);
    }

    // 2. Render smooth vector strokes on top
    for (const s of strokesRef.current) {
      drawSmoothStroke(ctx, s);
    }
    if (activeStrokeRef.current) {
      drawSmoothStroke(ctx, activeStrokeRef.current);
    }

    ctx.restore();

    // Update hidden WebRTC composite stream canvas if active
    const comp = compositeCanvasRef.current;
    if (comp) {
      const cctx = comp.getContext('2d');
      if (cctx) {
        cctx.save();
        cctx.fillStyle = '#FFFFFF';
        cctx.fillRect(0, 0, comp.width, comp.height);
        cctx.drawImage(canvas, 0, 0, comp.width, comp.height);
        cctx.restore();
      }
    }
  }, [drawObjectOnCtx]);

  const scheduleRedraw = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      redrawCanvas();
    });
  }, [redrawCanvas]);

  // Preload image elements whenever objects change
  useEffect(() => {
    let active = true;
    objects.forEach((obj) => {
      if (obj.kind !== 'image') return;
      if (obj.signedUrl) {
        if (!imageCacheRef.current.has(obj.signedUrl)) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (active) scheduleRedraw();
          };
          img.src = obj.signedUrl;
          imageCacheRef.current.set(obj.signedUrl, img);
        }
      } else if (obj.storagePath) {
        getWhiteboardMediaSignedUrl(obj.storagePath).then((url) => {
          if (!active || !url) return;
          setObjects((prev) =>
            prev.map((item) => (item.id === obj.id ? { ...item, signedUrl: url } : item))
          );
        });
      }
    });
    return () => {
      active = false;
    };
  }, [objects, scheduleRedraw]);

  // ResizeObserver keeps infinite canvas sharp on phone rotation / window resize
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') {
      scheduleRedraw();
      return;
    }
    const ro = new ResizeObserver(() => scheduleRedraw());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [scheduleRedraw]);

  useEffect(() => {
    scheduleRedraw();
  }, [strokes, objects, camera, scheduleRedraw]);

  // Expose WebRTC board stream
  useEffect(() => {
    if (!onCanvasStreamReady || !compositeCanvasRef.current) return;
    try {
      const comp = compositeCanvasRef.current;
      if (typeof comp.captureStream === 'function') {
        onCanvasStreamReady(comp.captureStream(20));
      }
    } catch (_) {
      onCanvasStreamReady(null);
    }
  }, [onCanvasStreamReady]);

  // Apply incoming realtime whiteboard events
  useEffect(() => {
    if (!incomingSyncEvent) return;

    if (incomingSyncEvent.type === 'sync-history') {
      setStrokes(incomingSyncEvent.strokes);
      setRedoStack([]);
    } else if (incomingSyncEvent.type === 'sync-objects') {
      setObjects(incomingSyncEvent.objects);
    } else if (incomingSyncEvent.type === 'stroke') {
      const incoming = incomingSyncEvent.stroke;
      setStrokes((prev) => (prev.some((s) => s.id === incoming.id) ? prev : [...prev, incoming]));
    } else if (incomingSyncEvent.type === 'object-upsert') {
      const inc = incomingSyncEvent.object;
      setObjects((prev) => {
        const exists = prev.some((o) => o.id === inc.id);
        if (!exists) return [...prev, inc];
        return prev.map((o) =>
          o.id === inc.id ? { ...o, ...inc, signedUrl: inc.signedUrl || o.signedUrl } : o
        );
      });
    } else if (incomingSyncEvent.type === 'object-delete') {
      setObjects((prev) => prev.filter((o) => o.id !== incomingSyncEvent.objectId));
      setSelectedObjectId((cur) => (cur === incomingSyncEvent.objectId ? null : cur));
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
      setObjects([]);
      setSelectedObjectId(null);
    }
  }, [incomingSyncEvent]);

  const handleUndo = useCallback(() => {
    if (!canDraw) return;
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      onBroadcastEvent?.({ type: 'undo', strokeId: last.id, senderId: currentUserId });
      return prev.slice(0, -1);
    });
  }, [canDraw, currentUserId, onBroadcastEvent]);

  const handleRedo = useCallback(() => {
    if (!canDraw) return;
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const restored = prevRedo[prevRedo.length - 1];
      setStrokes((s) => (s.some((x) => x.id === restored.id) ? s : [...s, restored]));
      onBroadcastEvent?.({ type: 'redo', strokeId: restored.id, senderId: currentUserId });
      return prevRedo.slice(0, -1);
    });
  }, [canDraw, currentUserId, onBroadcastEvent]);

  const handleDeleteObject = useCallback(
    (objId: string) => {
      if (!canDraw) return;
      setObjects((prev) => prev.filter((o) => o.id !== objId));
      setSelectedObjectId(null);
      onBroadcastEvent?.({ type: 'object-delete', objectId: objId, senderId: currentUserId });
    },
    [canDraw, currentUserId, onBroadcastEvent]
  );

  const commitObjectUpdate = useCallback(
    (updated: WhiteboardObjectPayload, ephemeral = false) => {
      if (!canDraw) return;
      if (ephemeral) {
        const now = Date.now();
        if (now - lastEphemeralBroadcastRef.current < 80) return;
        lastEphemeralBroadcastRef.current = now;
      }
      onBroadcastEvent?.({ type: 'object-upsert', object: updated, ephemeral });
    },
    [canDraw, onBroadcastEvent]
  );

  const insertImageFile = useCallback(
    async (file: File, dropClientX?: number, dropClientY?: number) => {
      if (!canDraw || !file.type.startsWith('image/')) return;
      setUploadingImage(true);
      setUploadError(null);
      try {
        const result = await compressAndUploadWhiteboardImage(roomId, file);
        if ('error' in result) {
          setUploadError(result.error);
          return;
        }
        const stageRect = stageRef.current?.getBoundingClientRect();
        const centerClientX = dropClientX ?? (stageRect ? stageRect.left + stageRect.width / 2 : 300);
        const centerClientY = dropClientY ?? (stageRect ? stageRect.top + stageRect.height / 2 : 240);
        const worldCenter = screenToWorld(centerClientX, centerClientY);

        const maxDisplayW = 380;
        const aspect = result.width / Math.max(1, result.height);
        const w = Math.min(maxDisplayW, result.width);
        const h = Math.round(w / aspect);
        const maxZ = objectsRef.current.reduce((m, o) => Math.max(m, o.zIndex || 1), 0);

        const newObj: WhiteboardObjectPayload = {
          id: genId('img'),
          kind: 'image',
          storagePath: result.storagePath,
          signedUrl: result.signedUrl,
          x: Math.round(worldCenter.x - w / 2),
          y: Math.round(worldCenter.y - h / 2),
          width: w,
          height: h,
          rotation: 0,
          zIndex: maxZ + 1,
          senderId: currentUserId
        };

        setObjects((prev) => [...prev, newObj]);
        setSelectedObjectId(newObj.id);
        setTool('select');

        const ok = await Promise.resolve(
          onBroadcastEvent?.({ type: 'object-upsert', object: newObj })
        );
        if (ok === false) {
          setObjects((prev) => prev.filter((o) => o.id !== newObj.id));
          setUploadError(t('Permission denied to add image.', 'لا تملك صلاحية إضافة صور.'));
        }
      } finally {
        setUploadingImage(false);
      }
    },
    [canDraw, roomId, screenToWorld, currentUserId, onBroadcastEvent, language]
  );

  // Keyboard shortcuts: Space+drag pan, Ctrl+Z/Y undo/redo, Delete selected object, Ctrl+V paste image
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        spacePressedRef.current = true;
      } else if (canDraw && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (canDraw && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (canDraw && (e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        e.preventDefault();
        handleDeleteObject(selectedObjectId);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePressedRef.current = false;
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!canDraw) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void insertImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
    };
  }, [canDraw, handleUndo, handleRedo, selectedObjectId, handleDeleteObject, insertImageFile]);

  const zoomAtPoint = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    setCamera((prev) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const worldX = (sx - prev.x) / prev.zoom;
      const worldY = (sy - prev.y) / prev.zoom;
      return {
        zoom: Number(clamped.toFixed(3)),
        x: sx - worldX * clamped,
        y: sy - worldY * clamped
      };
    });
  }, []);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomAtPoint(cameraRef.current.zoom * factor, e.clientX, e.clientY);
  };

  const handleFitToContent = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const s of strokesRef.current) {
      for (const pt of s.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    for (const o of objectsRef.current) {
      if (o.x < minX) minX = o.x;
      if (o.y < minY) minY = o.y;
      if (o.x + o.width > maxX) maxX = o.x + o.width;
      if (o.y + o.height > maxY) maxY = o.y + o.height;
    }

    if (!isFinite(minX) || !isFinite(minY)) {
      setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }

    const pad = 48;
    const contentW = Math.max(80, maxX - minX);
    const contentH = Math.max(80, maxY - minY);
    const zoom = Math.min(2, Math.max(MIN_ZOOM, Math.min((w - pad * 2) / contentW, (h - pad * 2) / contentH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setCamera({
      zoom: Number(zoom.toFixed(3)),
      x: w / 2 - centerX * zoom,
      y: h / 2 - centerY * zoom
    });
  }, []);

  const hitTestObject = (worldX: number, worldY: number): WhiteboardObjectPayload | null => {
    const sorted = [...objectsRef.current].sort((a, b) => (b.zIndex || 1) - (a.zIndex || 1));
    for (const o of sorted) {
      if (worldX >= o.x && worldX <= o.x + o.width && worldY >= o.y && worldY <= o.y + o.height) {
        return o;
      }
    }
    return null;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setOpenPopover('none');
    e.preventDefault();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    // Track multi-touch pointers for 2-finger pan + pinch zoom
    if (e.pointerType === 'touch') {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size === 2) {
        // Cancel any in-progress single-finger stroke
        activeStrokeRef.current = null;
        dragActionRef.current = null;
        const pts = Array.from(touchPointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        pinchStartRef.current = {
          dist,
          midX,
          midY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
          camZoom: cameraRef.current.zoom
        };
        return;
      }
    }

    const isPanGesture =
      tool === 'hand' ||
      !canDraw ||
      spacePressedRef.current ||
      (e.pointerType === 'mouse' && e.button === 1);

    if (isPanGesture) {
      activePointerIdRef.current = e.pointerId;
      dragActionRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y
      };
      return;
    }

    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (tool === 'text') {
      setEditingText({ worldX: worldPt.x, worldY: worldPt.y, value: '' });
      return;
    }

    if (tool === 'select') {
      const hit = hitTestObject(worldPt.x, worldPt.y);
      if (hit) {
        setSelectedObjectId(hit.id);
        activePointerIdRef.current = e.pointerId;
        dragActionRef.current = {
          kind: 'move-obj',
          objId: hit.id,
          startWorldX: worldPt.x,
          startWorldY: worldPt.y,
          origX: hit.x,
          origY: hit.y
        };
      } else {
        setSelectedObjectId(null);
      }
      return;
    }

    // Pen or Eraser stroke
    setSelectedObjectId(null);
    activePointerIdRef.current = e.pointerId;
    activeStrokeRef.current = {
      id: genId('st'),
      mode: tool === 'erase' ? 'erase' : 'draw',
      color: tool === 'erase' ? '#FFFFFF' : penColor,
      width: tool === 'erase' ? eraserWidth : penWidth,
      points: [worldPt],
      senderId: currentUserId
    };
    scheduleRedraw();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size === 2 && pinchStartRef.current && canvasRef.current) {
        e.preventDefault();
        const pts = Array.from(touchPointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const rect = canvasRef.current.getBoundingClientRect();
        const start = pinchStartRef.current;

        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.camZoom * (dist / start.dist)));
        const startLocalX = start.midX - rect.left;
        const startLocalY = start.midY - rect.top;
        const curLocalX = midX - rect.left;
        const curLocalY = midY - rect.top;

        const worldMidX = (startLocalX - start.camX) / start.camZoom;
        const worldMidY = (startLocalY - start.camY) / start.camZoom;

        setCamera({
          zoom: Number(nextZoom.toFixed(3)),
          x: curLocalX - worldMidX * nextZoom,
          y: curLocalY - worldMidY * nextZoom
        });
        return;
      }
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    const drag = dragActionRef.current;
    if (drag) {
      e.preventDefault();
      if (drag.kind === 'pan') {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setCamera((prev) => ({ ...prev, x: drag.camX + dx, y: drag.camY + dy }));
      } else if (drag.kind === 'move-obj') {
        const pt = screenToWorld(e.clientX, e.clientY);
        const nx = Math.round(drag.origX + (pt.x - drag.startWorldX));
        const ny = Math.round(drag.origY + (pt.y - drag.startWorldY));
        let moved: WhiteboardObjectPayload | null = null;
        setObjects((prev) =>
          prev.map((o) => {
            if (o.id !== drag.objId) return o;
            moved = { ...o, x: nx, y: ny };
            return moved;
          })
        );
        if (moved) commitObjectUpdate(moved, true);
      }
      return;
    }

    if (!canDraw || !activeStrokeRef.current) return;
    e.preventDefault();

    const nativeEvt = e.nativeEvent as PointerEvent;
    const coalesced =
      typeof nativeEvt.getCoalescedEvents === 'function' ? nativeEvt.getCoalescedEvents() : [nativeEvt];
    const pts = activeStrokeRef.current.points;
    let added = false;
    const minDist = 1.5 / Math.max(0.4, cameraRef.current.zoom);
    for (const ev of coalesced) {
      const pt = screenToWorld(ev.clientX, ev.clientY);
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= minDist) {
        pts.push(pt);
        added = true;
      }
    }
    if (added) scheduleRedraw();
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touchPointersRef.current.delete(e.pointerId);
      if (touchPointersRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    activePointerIdRef.current = null;

    const drag = dragActionRef.current;
    dragActionRef.current = null;
    if (drag && drag.kind === 'move-obj') {
      const finalObj = objectsRef.current.find((o) => o.id === drag.objId);
      if (finalObj) commitObjectUpdate(finalObj, false);
      return;
    }

    if (!activeStrokeRef.current) return;
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;

    if (!canDraw || finished.points.length === 0) {
      scheduleRedraw();
      return;
    }

    setStrokes((prev) => [...prev, finished]);
    setRedoStack([]);
    Promise.resolve(onBroadcastEvent?.({ type: 'stroke', stroke: finished })).then((ok) => {
      if (ok === false) {
        setStrokes((prev) => prev.filter((s) => s.id !== finished.id));
      }
    });
  };

  // Resize / Rotate overlay handle pointer handlers (for selected image/text)
  const startObjectHandleDrag = (
    e: React.PointerEvent,
    obj: WhiteboardObjectPayload,
    mode: 'resize-obj' | 'rotate-obj'
  ) => {
    if (!canDraw) return;
    e.stopPropagation();
    e.preventDefault();
    const startPt = screenToWorld(e.clientX, e.clientY);
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;

    const onMove = (ev: PointerEvent) => {
      const cur = screenToWorld(ev.clientX, ev.clientY);
      let updated: WhiteboardObjectPayload | null = null;
      if (mode === 'resize-obj') {
        const aspect = obj.width / Math.max(1, obj.height);
        const dx = cur.x - startPt.x;
        const nextW = Math.max(48, Math.round(obj.width + dx));
        const nextH = Math.max(32, Math.round(nextW / aspect));
        setObjects((prev) =>
          prev.map((o) => {
            if (o.id !== obj.id) return o;
            updated = { ...o, width: nextW, height: nextH };
            return updated;
          })
        );
      } else {
        const startAngle = Math.atan2(startPt.y - cy, startPt.x - cx);
        const curAngle = Math.atan2(cur.y - cy, cur.x - cx);
        const deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;
        const nextRot = Math.round(obj.rotation + deltaDeg);
        setObjects((prev) =>
          prev.map((o) => {
            if (o.id !== obj.id) return o;
            updated = { ...o, rotation: nextRot };
            return updated;
          })
        );
      }
      if (updated) commitObjectUpdate(updated, true);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const finalObj = objectsRef.current.find((o) => o.id === obj.id);
      if (finalObj) commitObjectUpdate(finalObj, false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const adjustObjectLayer = (obj: WhiteboardObjectPayload, delta: 1 | -1) => {
    if (!canDraw) return;
    const nextZ = Math.max(1, (obj.zIndex || 1) + delta);
    const updated = { ...obj, zIndex: nextZ };
    setObjects((prev) => prev.map((o) => (o.id === obj.id ? updated : o)));
    commitObjectUpdate(updated, false);
  };

  const handleCommitText = () => {
    if (!editingText || !canDraw) {
      setEditingText(null);
      return;
    }
    const text = editingText.value.trim();
    if (!text) {
      setEditingText(null);
      return;
    }
    const maxZ = objectsRef.current.reduce((m, o) => Math.max(m, o.zIndex || 1), 0);
    const lines = text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 6);
    const fontSize = Math.max(18, Math.min(40, penWidth * 4 + 14));
    const width = Math.min(520, Math.max(120, Math.round(longest * fontSize * 0.62) + 16));
    const height = Math.max(40, Math.round(lines.length * fontSize * 1.35) + 12);

    const newObj: WhiteboardObjectPayload = {
      id: editingText.id || genId('txt'),
      kind: 'text',
      textContent: text,
      color: penColor,
      fontSize,
      x: Math.round(editingText.worldX),
      y: Math.round(editingText.worldY),
      width,
      height,
      rotation: 0,
      zIndex: maxZ + 1,
      senderId: currentUserId
    };

    setObjects((prev) =>
      prev.some((o) => o.id === newObj.id)
        ? prev.map((o) => (o.id === newObj.id ? newObj : o))
        : [...prev, newObj]
    );
    setSelectedObjectId(newObj.id);
    setEditingText(null);
    setTool('select');
    onBroadcastEvent?.({ type: 'object-upsert', object: newObj });
  };

  const confirmClearBoard = () => {
    if (!canDraw) return;
    setShowClearConfirm(false);
    setStrokes([]);
    setRedoStack([]);
    setObjects([]);
    setSelectedObjectId(null);
    onBroadcastEvent?.({ type: 'clear', senderId: currentUserId });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const selectedObject = selectedObjectId ? objects.find((o) => o.id === selectedObjectId) || null : null;
  const activeSize = tool === 'erase' ? eraserWidth : penWidth;

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        if (!canDraw) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (!canDraw) return;
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
          void insertImageFile(file, e.clientX, e.clientY);
        }
      }}
      className={`bg-white flex flex-col text-slate-900 font-sans select-none overflow-hidden relative ${
        isEmbedded
          ? 'w-full h-full min-h-[300px] rounded-2xl border border-slate-200 shadow-sm'
          : 'fixed inset-0 z-50'
      }`}
    >
      {/* Hidden composite canvas for WebRTC captureStream */}
      <canvas ref={compositeCanvasRef} width={1200} height={800} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFile(file);
          e.target.value = '';
        }}
      />

      {/* Full-Bleed Infinite White Canvas Stage */}
      <div
        ref={stageRef}
        onWheel={handleWheel}
        className="flex-1 relative overflow-hidden bg-white w-full h-full"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          style={{ touchAction: 'none' }}
          className={`w-full h-full block bg-white ${
            tool === 'hand' || !canDraw
              ? 'cursor-grab active:cursor-grabbing'
              : tool === 'select'
              ? 'cursor-default'
              : tool === 'text'
              ? 'cursor-text'
              : tool === 'erase'
              ? 'cursor-cell'
              : 'cursor-crosshair'
          }`}
        />

        {/* Selected Object Interactive Selection Box (Resize, Rotate, Layer, Delete) */}
        {canDraw && selectedObject && (
          <div
            style={{
              position: 'absolute',
              left: `${selectedObject.x * camera.zoom + camera.x}px`,
              top: `${selectedObject.y * camera.zoom + camera.y}px`,
              width: `${selectedObject.width * camera.zoom}px`,
              height: `${selectedObject.height * camera.zoom}px`,
              transform: `rotate(${selectedObject.rotation || 0}deg)`,
              transformOrigin: 'center center'
            }}
            className="pointer-events-none border-2 border-blue-600 rounded-lg z-20"
          >
            {/* Object Mini Action Pill */}
            <div className="pointer-events-auto absolute -top-11 left-1/2 -translate-x-1/2 bg-white border border-slate-200 shadow-md rounded-xl px-1 py-1 flex items-center gap-0.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => adjustObjectLayer(selectedObject, 1)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-700 flex items-center justify-center"
                title={t('Bring Forward', 'للأمام', 'Avancer')}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => adjustObjectLayer(selectedObject, -1)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-700 flex items-center justify-center"
                title={t('Send Backward', 'للخلف', 'Reculer')}
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => startObjectHandleDrag(e, selectedObject, 'rotate-obj')}
                className="w-8 h-8 rounded-lg hover:bg-blue-50 text-blue-600 flex items-center justify-center cursor-grab"
                title={t('Rotate', 'تدوير', 'Pivoter')}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteObject(selectedObject.id)}
                className="w-8 h-8 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center justify-center"
                title={t('Delete', 'حذف', 'Supprimer')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bottom-Right Aspect-Ratio Resize Handle */}
            <div
              onPointerDown={(e) => startObjectHandleDrag(e, selectedObject, 'resize-obj')}
              className="pointer-events-auto absolute -bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-md cursor-nwse-resize"
              title={t('Drag to resize', 'اسحب لتغيير الحجم', 'Redimensionner')}
            />
          </div>
        )}

        {/* Inline Text Placement Input */}
        {canDraw && editingText && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.max(12, editingText.worldX * camera.zoom + camera.x)}px`,
              top: `${Math.max(56, editingText.worldY * camera.zoom + camera.y)}px`
            }}
            className="z-30 bg-white border-2 border-blue-500 rounded-xl shadow-lg p-2 flex items-start gap-1.5 max-w-[260px]"
          >
            <textarea
              autoFocus
              rows={2}
              value={editingText.value}
              onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitText();
                } else if (e.key === 'Escape') {
                  setEditingText(null);
                }
              }}
              placeholder={t('Type text...', 'اكتب نصاً...', 'Saisir du texte...')}
              className="w-44 text-sm text-slate-900 bg-transparent outline-none resize-none"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleCommitText}
                className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingText(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Drag-Drop Overlay */}
        {isDragOver && canDraw && (
          <div className="absolute inset-3 z-30 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
            <ImagePlus className="w-8 h-8 text-blue-600" />
            <p className="text-sm font-bold text-blue-700">
              {t('Drop image onto whiteboard', 'أفلت الصورة على السبورة', 'Déposez l\'image ici')}
            </p>
          </div>
        )}

        {/* Top-Left Compact Status Pill */}
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
          {canDraw ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/95 backdrop-blur text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isTutor
                ? t('Host Board', 'سبورة الأستاذ', 'Tableau prof')
                : t('Drawing Enabled', 'الرسم مفعّل', 'Dessin autorisé')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/95 backdrop-blur text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full shadow-sm">
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              {t('View only', 'للعرض فقط', 'Lecture seule')}
            </span>
          )}
          {uploadingImage && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-blue-600 text-white px-2.5 py-1 rounded-full shadow-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('Uploading...', 'جاري الرفع...', 'Envoi...')}
            </span>
          )}
        </div>

        {/* Top-Right Compact Zoom + Fit + Stream + Fullscreen Pill */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200/90 p-1 rounded-xl shadow-sm">
          <button
            type="button"
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              zoomAtPoint(cameraRef.current.zoom * 0.8, r ? r.left + r.width / 2 : 200, r ? r.top + r.height / 2 : 200);
            }}
            className="w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"
            title={t('Zoom Out', 'تصغير', 'Dézoomer')}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-bold font-mono text-slate-700 px-1 min-w-[38px] text-center">
            {Math.round(camera.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              zoomAtPoint(cameraRef.current.zoom * 1.25, r ? r.left + r.width / 2 : 200, r ? r.top + r.height / 2 : 200);
            }}
            className="w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"
            title={t('Zoom In', 'تكبير', 'Zoomer')}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleFitToContent}
            className="w-9 h-9 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center justify-center"
            title={t('Fit to content', 'ملاءمة المحتوى', 'Ajuster au contenu')}
          >
            <Scan className="w-4 h-4" />
          </button>
          {isTutor && onToggleStreamCanvas && (
            <button
              type="button"
              onClick={onToggleStreamCanvas}
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isStreamingCanvas ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={t('Broadcast Board', 'بث السبورة')}
            >
              <Radio className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center"
            title={t('Fullscreen', 'ملء الشاشة', 'Plein écran')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {onClose && !isEmbedded && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center ml-0.5"
              title={t('Close', 'إغلاق', 'Fermer')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Upload Error Notice */}
        {uploadError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-md flex items-center gap-2">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ONE Compact Floating Mobile-First Toolbar (Bottom Center) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-16px)] flex flex-col items-center gap-2">
          {/* Collapsible Color Popover */}
          {canDraw && openPopover === 'color' && (
            <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-xl p-2.5 flex items-center gap-2 flex-wrap justify-center max-w-[320px]">
              {PRESET_COLORS.map((c) => {
                const isSelected = penColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => {
                      setPenColor(c.hex);
                      setOpenPopover('none');
                    }}
                    aria-label={c.label}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      isSelected ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : 'border border-slate-300'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
              <input
                ref={customColorInputRef}
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => customColorInputRef.current?.click()}
                className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
              >
                <Palette className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('Custom', 'مخصص', 'Perso')}</span>
              </button>
            </div>
          )}

          {/* Collapsible Size Popover */}
          {canDraw && openPopover === 'size' && (
            <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-xl px-3 py-2.5 flex items-center gap-2.5 flex-wrap justify-center max-w-[330px]">
              <div className="flex items-center gap-1.5">
                {(tool === 'erase' ? ERASER_SIZE_PRESETS : PEN_SIZE_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => (tool === 'erase' ? setEraserWidth(preset) : setPenWidth(preset))}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                      activeSize === preset ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: `${Math.min(18, Math.max(4, tool === 'erase' ? preset / 2.4 : preset))}px`,
                        height: `${Math.min(18, Math.max(4, tool === 'erase' ? preset / 2.4 : preset))}px`,
                        backgroundColor: tool === 'erase' ? '#94A3B8' : penColor
                      }}
                    />
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={tool === 'erase' ? 8 : 1}
                max={tool === 'erase' ? 48 : 20}
                value={activeSize}
                onChange={(e) =>
                  tool === 'erase' ? setEraserWidth(Number(e.target.value)) : setPenWidth(Number(e.target.value))
                }
                className="w-24 accent-blue-600"
              />
              <span className="text-xs font-mono font-bold text-slate-700 min-w-[32px]">{activeSize}px</span>
            </div>
          )}

          {/* Single Compact Floating Pill Bar */}
          <div className="bg-white/95 backdrop-blur border border-slate-200/90 rounded-2xl shadow-lg px-1.5 py-1.5 flex items-center gap-1 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setTool('hand')}
              className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                tool === 'hand' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={t('Pan / Hand Tool (Space+Drag)', 'أداة التحريك', 'Main')}
            >
              <Hand className="w-4 h-4" />
            </button>

            {canDraw && (
              <>
                <button
                  type="button"
                  onClick={() => setTool('select')}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                    tool === 'select' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={t('Select & Move', 'تحديد وتحريك', 'Sélectionner')}
                >
                  <MousePointer2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('draw')}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                    tool === 'draw' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={t('Pen', 'قلم', 'Stylo')}
                >
                  <PenTool className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('erase')}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                    tool === 'erase' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={t('Eraser', 'ممحاة', 'Gomme')}
                >
                  <Eraser className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('text')}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                    tool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={t('Text', 'نص', 'Texte')}
                >
                  <Type className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  title={t('Insert Image', 'إدراج صورة', 'Insérer une image')}
                >
                  <ImagePlus className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-slate-200 mx-0.5 flex-shrink-0" />

                {/* Collapsible Color Trigger */}
                <button
                  type="button"
                  onClick={() => setOpenPopover((p) => (p === 'color' ? 'none' : 'color'))}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center border transition-all ${
                    openPopover === 'color' ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-slate-100'
                  }`}
                  title={t('Color', 'اللون', 'Couleur')}
                >
                  <span
                    className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                    style={{ backgroundColor: penColor }}
                  />
                </button>

                {/* Collapsible Size Trigger */}
                <button
                  type="button"
                  onClick={() => setOpenPopover((p) => (p === 'size' ? 'none' : 'size'))}
                  className={`w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition-all ${
                    openPopover === 'size' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={t('Stroke Size', 'السماكة', 'Épaisseur')}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-slate-200 mx-0.5 flex-shrink-0" />

                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  title={t('Undo', 'تراجع', 'Annuler')}
                >
                  <Undo2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  title={t('Redo', 'إعادة', 'Rétablir')}
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={strokes.length === 0 && objects.length === 0}
                  className="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                  title={t('Clear Board', 'مسح السبورة', 'Tout effacer')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
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
                    'This removes all drawings, images, and text for everyone in the session.',
                    'سيؤدي هذا إلى مسح جميع الرسومات والصور والنصوص لدى الجميع في الحصة.',
                    'Cela supprimera tous les dessins, images et textes pour tous les participants.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                {t('Cancel', 'إلغاء', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={confirmClearBoard}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700"
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
