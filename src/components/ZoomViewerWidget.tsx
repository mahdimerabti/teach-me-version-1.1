import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eraser,
  Trash2,
  Move,
  FileText,
  Sparkles,
  PenTool,
  Upload,
  Radio,
  Crosshair
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
  onBroadcastEvent?: (event: WhiteboardSyncEvent) => void;
  incomingSyncEvent?: WhiteboardSyncEvent | null;
  onCanvasStreamReady?: (stream: MediaStream | null) => void;
  isStreamingCanvas?: boolean;
  onToggleStreamCanvas?: () => void;
}

type Material = {
  id: string;
  titleEn: string;
  titleAr: string;
  type: 'svg' | 'image';
  content: string;
};

const SAMPLE_MATERIALS: Material[] = [
  {
    id: 'math-geometry',
    titleEn: 'Geometry & Pythagoras Theorem',
    titleAr: 'الهندسة ومبرهنة فيثاغورس',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0F172A" rx="16"/>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1E293B" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="800" height="600" fill="url(#grid)"/>
        <polygon points="200,450 600,450 600,150" fill="rgba(59, 130, 246, 0.15)" stroke="#60A5FA" stroke-width="4"/>
        <rect x="570" y="420" width="30" height="30" fill="none" stroke="#93C5FD" stroke-width="2"/>
        <text x="400" y="485" fill="#93C5FD" font-size="22" font-weight="bold" text-anchor="middle">Base (a) = 4 cm</text>
        <text x="635" y="300" fill="#93C5FD" font-size="22" font-weight="bold">Height (b) = 3 cm</text>
        <text x="360" y="270" fill="#F472B6" font-size="24" font-weight="bold">Hypotenuse (c) = 5 cm</text>
        <rect x="50" y="50" width="360" height="120" rx="12" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
        <text x="70" y="95" fill="#60A5FA" font-size="22" font-weight="bold">a² + b² = c²</text>
        <text x="70" y="135" fill="#E2E8F0" font-size="18">4² + 3² = 16 + 9 = 25 (5²)</text>
      </svg>
    `
  },
  {
    id: 'physics-circuits',
    titleEn: 'Electrical Circuits & Ohm’s Law',
    titleAr: 'الدوائر الكهربائية وقانون أوم',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#090D16" rx="16"/>
        <path d="M 150 300 L 150 150 L 650 150 L 650 300 M 650 300 L 650 450 L 150 450 L 150 300" fill="none" stroke="#10B981" stroke-width="4"/>
        <line x1="130" y1="280" x2="170" y2="280" stroke="#34D399" stroke-width="6"/>
        <line x1="140" y1="320" x2="160" y2="320" stroke="#34D399" stroke-width="4"/>
        <text x="80" y="305" fill="#34D399" font-size="20" font-weight="bold">V = 12V</text>
        <path d="M 350 150 L 370 130 L 400 170 L 430 130 L 460 170 L 480 150" fill="none" stroke="#FBBF24" stroke-width="4"/>
        <text x="400" y="105" fill="#FBBF24" font-size="20" font-weight="bold" text-anchor="middle">R = 4 Ω</text>
        <rect x="250" y="230" width="300" height="140" rx="16" fill="#1E293B" stroke="#10B981" stroke-width="2"/>
        <text x="400" y="280" fill="#34D399" font-size="26" font-weight="bold" text-anchor="middle">Ohm's Law: V = I × R</text>
        <text x="400" y="330" fill="#E2E8F0" font-size="20" text-anchor="middle">Current (I) = V / R = 3 Amperes</text>
      </svg>
    `
  },
  {
    id: 'arabic-grammar',
    titleEn: 'Arabic Sentence Structure Chart',
    titleAr: 'مخطط الإعراب والجملة الاسمية',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#111827" rx="16"/>
        <text x="400" y="70" fill="#818CF8" font-size="32" font-weight="bold" text-anchor="middle">الجملة الاسمية وأركانها</text>
        <rect x="100" y="150" width="280" height="180" rx="16" fill="#1F2937" stroke="#6366F1" stroke-width="3"/>
        <text x="240" y="200" fill="#818CF8" font-size="26" font-weight="bold" text-anchor="middle">المبتدأ</text>
        <text x="240" y="240" fill="#D1D5DB" font-size="18" text-anchor="middle">اسم مرفوع تبدأ به الجملة</text>
        <text x="240" y="280" fill="#A5B4FC" font-size="20" text-anchor="middle">مثال: العلمُ نورٌ</text>
        <rect x="420" y="150" width="280" height="180" rx="16" fill="#1F2937" stroke="#EC4899" stroke-width="3"/>
        <text x="560" y="200" fill="#F472B6" font-size="26" font-weight="bold" text-anchor="middle">الخبر</text>
        <text x="560" y="240" fill="#D1D5DB" font-size="18" text-anchor="middle">ما يتم به معنى الجملة</text>
        <text x="560" y="280" fill="#FBCFE8" font-size="20" text-anchor="middle">علامة رفعه الضمة الظاهرة</text>
        <line x1="380" y1="240" x2="420" y2="240" stroke="#F59E0B" stroke-width="4" stroke-dasharray="6,6"/>
      </svg>
    `
  },
  {
    id: 'whiteboard',
    titleEn: 'Interactive Whiteboard Grid',
    titleAr: 'سبورة تفاعلية بيضاء',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0F172A" rx="16"/>
        <defs>
          <pattern id="dotgrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1.5" fill="#334155"/>
          </pattern>
        </defs>
        <rect width="800" height="600" fill="url(#dotgrid)"/>
        <text x="400" y="560" fill="#475569" font-size="18" font-weight="bold" text-anchor="middle">السبورة التفاعلية المتزامنة لحظياً بين الأستاذ والطالب</text>
      </svg>
    `
  }
];

export default function ZoomViewerWidget({
  language,
  onClose,
  isEmbedded = false,
  currentUserId = 'local-user',
  currentUserName = 'User',
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
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<Material[]>(SAMPLE_MATERIALS);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeMaterial, setActiveMaterial] = useState<Material>(SAMPLE_MATERIALS[0]);

  const [mode, setMode] = useState<'pan' | 'draw' | 'erase' | 'laser'>('draw');
  const [penColor, setPenColor] = useState('#3B82F6');
  const [penWidth, setPenWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentStrokePointsRef = useRef<WhiteboardStrokePoint[]>([]);
  const [remoteLaser, setRemoteLaser] = useState<{
    x: number;
    y: number;
    visible: boolean;
    senderName: string;
  } | null>(null);

  // Sync composite canvas (Background + Annotations) for Android WebView WebRTC screen sharing
  const updateCompositeCanvas = useCallback(() => {
    const comp = compositeCanvasRef.current;
    const drawCanvas = canvasRef.current;
    if (!comp || !drawCanvas) return;
    const ctx = comp.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, comp.width, comp.height);

    if (bgImageRef.current && bgImageRef.current.complete) {
      try {
        ctx.drawImage(bgImageRef.current, 0, 0, comp.width, comp.height);
      } catch (_) {}
    }
    ctx.drawImage(drawCanvas, 0, 0);
  }, []);

  // Load current material into an Image object so compositeCanvas can render it for captureStream
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      bgImageRef.current = img;
      updateCompositeCanvas();
    };
    if (activeMaterial.type === 'svg') {
      const svgBlob = new Blob([activeMaterial.content], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    } else {
      img.src = activeMaterial.content;
    }
  }, [activeMaterial, updateCompositeCanvas]);

  // Expose composite canvas MediaStream for Android WebView screen share fallback
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

  // Initialize drawing canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const renderStrokeOnCanvas = useCallback(
    (stroke: WhiteboardStrokePayload) => {
      const canvas = canvasRef.current;
      if (!canvas || stroke.points.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        for (const pt of stroke.points) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, stroke.width * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
      updateCompositeCanvas();
    },
    [updateCompositeCanvas]
  );

  // Apply incoming realtime whiteboard events from remote participant
  useEffect(() => {
    if (!incomingSyncEvent) return;

    if (incomingSyncEvent.type === 'stroke') {
      renderStrokeOnCanvas(incomingSyncEvent.stroke);
    } else if (incomingSyncEvent.type === 'clear') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        updateCompositeCanvas();
      }
    } else if (incomingSyncEvent.type === 'material') {
      if (incomingSyncEvent.customImageUrl) {
        const customMat: Material = {
          id: incomingSyncEvent.materialId,
          titleEn: 'Shared Study Slide',
          titleAr: 'ورقة شرح مشاركة',
          type: 'image',
          content: incomingSyncEvent.customImageUrl
        };
        setMaterials((prev) => {
          const exists = prev.some((m) => m.id === customMat.id);
          return exists ? prev : [...prev, customMat];
        });
        setActiveMaterial(customMat);
      } else {
        const found = materials.find((m) => m.id === incomingSyncEvent.materialId);
        if (found) setActiveMaterial(found);
      }
    } else if (incomingSyncEvent.type === 'viewport') {
      setScale(incomingSyncEvent.scale);
      setPosition(incomingSyncEvent.position);
    } else if (incomingSyncEvent.type === 'laser') {
      setRemoteLaser(
        incomingSyncEvent.visible
          ? {
              x: incomingSyncEvent.x,
              y: incomingSyncEvent.y,
              visible: true,
              senderName: incomingSyncEvent.senderName
            }
          : null
      );
    }
  }, [incomingSyncEvent, materials, renderStrokeOnCanvas, updateCompositeCanvas]);

  const syncViewport = (nextScale: number, nextPos: { x: number; y: number }) => {
    setScale(nextScale);
    setPosition(nextPos);
    onBroadcastEvent?.({
      type: 'viewport',
      scale: nextScale,
      position: nextPos,
      senderId: currentUserId
    });
  };

  const handleZoomIn = () => syncViewport(Math.min(scale + 0.25, 4), position);
  const handleZoomOut = () => syncViewport(Math.max(scale - 0.25, 0.5), position);
  const handleResetZoom = () => syncViewport(1, { x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = Math.min(Math.max(scale * zoomFactor, 0.5), 4);
    syncViewport(nextScale, position);
  };

  const getClientCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
    }
    return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY };
  };

  const getCanvasPoint = (clientX: number, clientY: number): WhiteboardStrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round((clientX - rect.left) * (canvas.width / rect.width)),
      y: Math.round((clientY - rect.top) * (canvas.height / rect.height))
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getClientCoordinates(e);
    if (mode === 'pan') {
      setIsDragging(true);
      setDragStart({ x: clientX - position.x, y: clientY - position.y });
      return;
    }

    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    if (mode === 'laser') {
      setIsDrawing(true);
      onBroadcastEvent?.({
        type: 'laser',
        x: pt.x,
        y: pt.y,
        visible: true,
        senderName: currentUserName,
        senderId: currentUserId
      });
      return;
    }

    setIsDrawing(true);
    currentStrokePointsRef.current = [pt];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);

    if (mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.arc(pt.x, pt.y, penWidth * 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
    }
    updateCompositeCanvas();
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getClientCoordinates(e);
    if (isDragging && mode === 'pan') {
      const nextPos = {
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      };
      setPosition(nextPos);
      return;
    }

    if (!isDrawing) return;
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    if (mode === 'laser') {
      onBroadcastEvent?.({
        type: 'laser',
        x: pt.x,
        y: pt.y,
        visible: true,
        senderName: currentUserName,
        senderId: currentUserId
      });
      return;
    }

    if (mode === 'draw' || mode === 'erase') {
      currentStrokePointsRef.current.push(pt);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, penWidth * 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      updateCompositeCanvas();
    }
  };

  const handleEnd = () => {
    if (isDragging && mode === 'pan') {
      setIsDragging(false);
      onBroadcastEvent?.({
        type: 'viewport',
        scale,
        position,
        senderId: currentUserId
      });
      return;
    }

    if (isDrawing) {
      setIsDrawing(false);
      if (mode === 'laser') {
        onBroadcastEvent?.({
          type: 'laser',
          x: 0,
          y: 0,
          visible: false,
          senderName: currentUserName,
          senderId: currentUserId
        });
        return;
      }

      if (currentStrokePointsRef.current.length > 0 && onBroadcastEvent) {
        onBroadcastEvent({
          type: 'stroke',
          stroke: {
            id: `st-${Date.now()}`,
            mode: mode === 'erase' ? 'erase' : 'draw',
            color: penColor,
            width: penWidth,
            points: currentStrokePointsRef.current,
            senderId: currentUserId
          }
        });
      }
      currentStrokePointsRef.current = [];
      updateCompositeCanvas();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateCompositeCanvas();
    onBroadcastEvent?.({
      type: 'clear',
      senderId: currentUserId
    });
  };

  const handleSelectMaterial = (mat: Material) => {
    setActiveMaterial(mat);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    onBroadcastEvent?.({
      type: 'material',
      materialId: mat.id,
      customImageUrl: mat.type === 'image' ? mat.content : undefined,
      senderId: currentUserId
    });
  };

  const handleUploadSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const customMat: Material = {
        id: `slide-${Date.now()}`,
        titleEn: file.name.slice(0, 22),
        titleAr: file.name.slice(0, 22),
        type: 'image',
        content: dataUrl
      };
      setMaterials((prev) => [...prev, customMat]);
      setActiveMaterial(customMat);
      onBroadcastEvent?.({
        type: 'material',
        materialId: customMat.id,
        customImageUrl: dataUrl,
        senderId: currentUserId
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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

  return (
    <div
      ref={containerRef}
      className={`bg-slate-950 flex flex-col text-slate-100 font-sans select-none overflow-hidden relative ${
        isEmbedded ? 'w-full h-full min-h-[380px] rounded-2xl border border-slate-800' : 'fixed inset-0 z-50'
      }`}
    >
      {/* Hidden composite canvas for WebRTC captureStream(25) on Android WebView */}
      <canvas ref={compositeCanvasRef} width={800} height={600} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadSlide}
      />

      {/* Top Header Bar */}
      <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
              {t('Realtime Interactive Whiteboard', 'السبورة التفاعلية المتزامنة')}
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {t('Live Sync', 'متزامن لحظياً')}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {t(language === 'ar' ? activeMaterial.titleAr : activeMaterial.titleEn, activeMaterial.titleAr)}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl shadow-inner">
          <button
            onClick={() => setMode('pan')}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
              mode === 'pan' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Pan & Drag Mode', 'نمط التحريك والتكبير')}
          >
            <Move className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('Pan', 'تحريك')}</span>
          </button>
          <button
            onClick={() => setMode('draw')}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
              mode === 'draw' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Draw / Annotate', 'نمط الرسم والكتابة')}
          >
            <PenTool className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('Draw', 'رسم')}</span>
          </button>
          <button
            onClick={() => setMode('erase')}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
              mode === 'erase' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Eraser', 'ممحاة')}
          >
            <Eraser className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('Erase', 'مسح')}</span>
          </button>
          <button
            onClick={() => setMode('laser')}
            className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
              mode === 'laser' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Laser Pointer', 'مؤشر ليزر')}
          >
            <Crosshair className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('Laser', 'ليزر')}</span>
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5" />

          {/* Zoom Controls */}
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Zoom In (+)', 'تكبير (+)')}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-bold font-mono text-blue-400 px-1 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Zoom Out (-)', 'تصغير (-)')}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Reset Zoom (100%)', 'إعادة ضبط الأبعاد (100%)')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5" />

          {/* Upload Slide Image */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 sm:px-2.5 sm:py-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
            title={t('Upload Study Image / Slide', 'رفع صورة أو تمرين للشرح')}
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('Upload Slide', 'رفع ورقة')}</span>
          </button>

          {/* Broadcast Canvas Video Track Button (Android WebView Screen Share) */}
          {onToggleStreamCanvas && (
            <button
              onClick={onToggleStreamCanvas}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                isStreamingCanvas
                  ? 'bg-emerald-600 text-white animate-pulse'
                  : 'text-amber-300 hover:bg-amber-950/40'
              }`}
              title={t('Broadcast Board as Video Stream', 'بث السبورة كفيديو مباشر')}
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {isStreamingCanvas ? t('Streaming Board', 'جاري بث السبورة') : t('Stream Board', 'بث السبورة')}
              </span>
            </button>
          )}

          {/* Clear & Fullscreen */}
          <button
            onClick={clearCanvas}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-xl transition-all"
            title={t('Clear Annotations', 'مسح الرسوم')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Toggle Fullscreen', 'ملء الشاشة')}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {onClose && !isEmbedded && (
            <button
              onClick={onClose}
              className="ml-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              {t('Close', 'إغلاق')}
            </button>
          )}
        </div>
      </div>

      {/* Color Bar when in Draw mode */}
      {mode === 'draw' && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">{t('Colors:', 'الألوان:')}</span>
            {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#FFFFFF', '#A855F7'].map((c) => (
              <button
                key={c}
                onClick={() => setPenColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  penColor === c ? 'scale-110 border-white shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">{t('Brush Size:', 'حجم القلم:')}</span>
            <input
              type="range"
              min="2"
              max="16"
              value={penWidth}
              onChange={(e) => setPenWidth(Number(e.target.value))}
              className="w-24 accent-blue-500 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Main Interactive Zoom Canvas Area */}
      <div
        className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        style={{ touchAction: 'none' }}
        onWheel={handleWheel}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      >
        <div
          className="relative transition-transform duration-75 ease-out flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            width: '800px',
            height: '600px'
          }}
        >
          {/* Base Educational Material (SVG or Uploaded Image) */}
          {activeMaterial.type === 'svg' ? (
            <div
              className="w-full h-full pointer-events-none rounded-2xl overflow-hidden shadow-2xl border border-slate-800"
              dangerouslySetInnerHTML={{ __html: activeMaterial.content }}
            />
          ) : (
            <div className="w-full h-full pointer-events-none rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex items-center justify-center">
              <img
                src={activeMaterial.content}
                alt={activeMaterial.titleEn}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          {/* Interactive Annotation Canvas Overlay */}
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{ touchAction: 'none' }}
            className={`absolute inset-0 w-full h-full rounded-2xl touch-none ${
              mode !== 'pan' ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
            }`}
          />

          {/* Remote Laser Pointer Overlay */}
          {remoteLaser && remoteLaser.visible && (
            <div
              className="absolute pointer-events-none z-30 flex items-center gap-1.5 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(remoteLaser.x / 800) * 100}%`,
                top: `${(remoteLaser.y / 600) * 100}%`
              }}
            >
              <span className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_14px_4px_rgba(244,63,94,0.9)] animate-ping" />
              <span className="w-3 h-3 rounded-full bg-rose-500 border border-white" />
              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold whitespace-nowrap shadow">
                {remoteLaser.senderName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Material Selector Ribbon */}
      <div className="bg-slate-900 border-t border-slate-800 px-3 sm:px-4 py-2 flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 max-w-full">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-blue-400" /> {t('Study Sheets:', 'أوراق الشرح:')}
          </span>
          {materials.map((mat) => (
            <button
              key={mat.id}
              onClick={() => handleSelectMaterial(mat)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                activeMaterial.id === mat.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {language === 'ar' ? mat.titleAr : mat.titleEn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
