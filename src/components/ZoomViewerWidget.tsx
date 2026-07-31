import { useState, useRef, useEffect } from 'react';
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
  PenTool
} from 'lucide-react';

interface Props {
  language: 'en' | 'ar' | 'fr';
  onClose?: () => void;
  isEmbedded?: boolean;
}

type Material = {
  id: string;
  titleEn: string;
  titleAr: string;
  type: 'svg' | 'canvas';
  content: string;
};

const SAMPLE_MATERIALS: Material[] = [
  {
    id: 'math-geometry',
    titleEn: 'Geometry & Pythagoras Theorem',
    titleAr: 'الهندسة مبرهنة فيثاغورس',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0F172A" rx="16"/>
        <grid width="800" height="600" fill="url(#grid)"/>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1E293B" stroke-width="1"/>
          </pattern>
        </defs>
        <!-- Triangle -->
        <polygon points="200,450 600,450 600,150" fill="rgba(59, 130, 246, 0.15)" stroke="#60A5FA" stroke-width="4"/>
        <rect x="570" y="420" width="30" height="30" fill="none" stroke="#93C5FD" stroke-width="2"/>
        <!-- Labels -->
        <text x="400" y="485" fill="#93C5FD" font-size="22" font-weight="bold" text-anchor="middle">Base (a) = 4 cm</text>
        <text x="635" y="300" fill="#93C5FD" font-size="22" font-weight="bold">Height (b) = 3 cm</text>
        <text x="360" y="270" fill="#F472B6" font-size="24" font-weight="bold">Hypotenuse (c) = 5 cm</text>
        <!-- Formula Box -->
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
      <svg viewBox="0 0 800 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#090D16" rx="16"/>
        <!-- Circuit Diagram -->
        <path d="M 150 300 L 150 150 L 650 150 L 650 300 M 650 300 L 650 450 L 150 450 L 150 300" fill="none" stroke="#10B981" stroke-width="4"/>
        <!-- Battery Symbol -->
        <line x1="130" y1="280" x2="170" y2="280" stroke="#34D399" stroke-width="6"/>
        <line x1="140" y1="320" x2="160" y2="320" stroke="#34D399" stroke-width="4"/>
        <text x="80" y="305" fill="#34D399" font-size="20" font-weight="bold">V = 12V</text>
        <!-- Resistor Symbol -->
        <path d="M 350 150 L 370 130 L 400 170 L 430 130 L 460 170 L 480 150" fill="none" stroke="#FBBF24" stroke-width="4"/>
        <text x="400" y="105" fill="#FBBF24" font-size="20" font-weight="bold" text-anchor="middle">R = 4 Ω</text>
        <!-- Formula Box -->
        <rect x="250" y="230" width="300" height="140" rx="16" fill="#1E293B" stroke="#10B981" stroke-width="2"/>
        <text x="400" y="280" fill="#34D399" font-size="26" font-weight="bold" text-anchor="middle">Ohm's Law: V = I × R</text>
        <text x="400" y="330" fill="#E2E8F0" font-size="20" text-anchor="middle">Current (I) = V / R = 3 Amperes</text>
      </svg>
    `
  },
  {
    id: 'arabic-grammar',
    titleEn: 'Arabic Sentence Structure Chart',
    titleAr: 'مخطط الإعراب والجملة الإسمية',
    type: 'svg',
    content: `
      <svg viewBox="0 0 800 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#111827" rx="16"/>
        <text x="400" y="70" fill="#818CF8" font-size="32" font-weight="bold" text-anchor="middle">الجملة الاسمية وأركانها</text>
        
        <!-- Box 1: Al Mubtada -->
        <rect x="100" y="150" width="280" height="180" rx="16" fill="#1F2937" stroke="#6366F1" stroke-width="3"/>
        <text x="240" y="200" fill="#818CF8" font-size="26" font-weight="bold" text-anchor="middle">المبتدأ</text>
        <text x="240" y="240" fill="#D1D5DB" font-size="18" text-anchor="middle">اسم مرفوع تبدأ به الجملة</text>
        <text x="240" y="280" fill="#A5B4FC" font-size="20" text-anchor="middle">مثال: العلمُ نورٌ</text>

        <!-- Box 2: Al Khabar -->
        <rect x="420" y="150" width="280" height="180" rx="16" fill="#1F2937" stroke="#EC4899" stroke-width="3"/>
        <text x="560" y="200" fill="#F472B6" font-size="26" font-weight="bold" text-anchor="middle">الخبر</text>
        <text x="560" y="240" fill="#D1D5DB" font-size="18" text-anchor="middle">ما يتم به معنى الجملة</text>
        <text x="560" y="280" fill="#FBCFE8" font-size="20" text-anchor="middle">علامة رفعه الضمة الظاهرة</text>

        <!-- Connecting Line -->
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
      <svg viewBox="0 0 800 600" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0F172A" rx="16"/>
        <grid width="800" height="600" fill="url(#dotgrid)"/>
        <defs>
          <pattern id="dotgrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1.5" fill="#334155"/>
          </pattern>
        </defs>
        <text x="400" y="300" fill="#475569" font-size="24" font-weight="bold" text-anchor="middle">انقر وارسم هنا بحرية في السبورة التفاعلية</text>
      </svg>
    `
  }
];

export default function ZoomViewerWidget({ language, onClose, isEmbedded = false }: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeMaterial, setActiveMaterial] = useState<Material>(SAMPLE_MATERIALS[0]);

  // Mode: 'pan' | 'draw' | 'erase'
  const [mode, setMode] = useState<'pan' | 'draw' | 'erase'>('pan');
  const [penColor, setPenColor] = useState('#3B82F6');
  const [penWidth, setPenWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Canvas drawing state
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(prev => Math.min(Math.max(prev * zoomFactor, 0.5), 4));
  };

  const getClientCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
    }
    return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getClientCoordinates(e);
    if (mode === 'pan') {
      setIsDragging(true);
      setDragStart({ x: clientX - position.x, y: clientY - position.y });
    } else {
      setIsDrawing(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const x = (clientX - rect.left) * (canvas.width / rect.width);
      const y = (clientY - rect.top) * (canvas.height / rect.height);

      ctx.beginPath();
      ctx.moveTo(x, y);

      if (mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.arc(x, y, penWidth * 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
      }
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getClientCoordinates(e);
    if (isDragging && mode === 'pan') {
      setPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      });
    } else if (isDrawing && (mode === 'draw' || mode === 'erase')) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const x = (clientX - rect.left) * (canvas.width / rect.width);
      const y = (clientY - rect.top) * (canvas.height / rect.height);

      if (mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, penWidth * 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const handleEnd = () => {
    setIsDragging(false);
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`bg-slate-950 flex flex-col text-slate-100 font-sans select-none overflow-hidden relative ${
        isEmbedded ? 'w-full h-full min-h-[450px] rounded-2xl border border-slate-800' : 'fixed inset-0 z-50'
      }`}
    >
      {/* Top Header Bar */}
      <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              {t('Teach Me Interactive Zoom Tool', 'علمني - أداة الزوم والسبورة التفاعلية')}
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                GitHub PanZoom SDK
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {t(language === 'ar' ? activeMaterial.titleAr : activeMaterial.titleEn, activeMaterial.titleAr)}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl shadow-inner">
          {/* Mode Selector */}
          <button
            onClick={() => setMode('pan')}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'pan' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Pan & Drag Mode', 'نمط التحريك والتكبير')}
          >
            <Move className="w-4 h-4" /> {t('Pan', 'تحريك')}
          </button>
          <button
            onClick={() => setMode('draw')}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'draw' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Draw / Annotate', 'نمط الرسم والكتابة')}
          >
            <PenTool className="w-4 h-4" /> {t('Draw', 'رسم')}
          </button>
          <button
            onClick={() => setMode('erase')}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'erase' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={t('Eraser', 'محاة')}
          >
            <Eraser className="w-4 h-4" /> {t('Erase', 'مسح')}
          </button>

          <div className="w-px h-6 bg-slate-800 mx-1" />

          {/* Zoom Controls */}
          <button
            onClick={handleZoomIn}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Zoom In (+)', 'تكبير (+)')}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold font-mono text-blue-400 px-1 min-w-[45px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Zoom Out (-)', 'تصغير (-)')}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Reset Zoom (100%)', 'إعادة ضبط الإبعاد (100%)')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-slate-800 mx-1" />

          {/* Clear & Fullscreen */}
          <button
            onClick={clearCanvas}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-xl transition-all"
            title={t('Clear Annotations', 'مسح الرسوم')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            title={t('Toggle Fullscreen', 'ملء الشاشة')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {onClose && !isEmbedded && (
            <button
              onClick={onClose}
              className="ml-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              {t('Close', 'إغلاق')}
            </button>
          )}
        </div>
      </div>

      {/* Color Bar when in Draw mode */}
      {mode === 'draw' && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-4 z-20 animate-slide-down">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">{t('Colors:', 'الألوان:')}</span>
            {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#FFFFFF', '#A855F7'].map(c => (
              <button
                key={c}
                onClick={() => setPenColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  penColor === c ? 'scale-110 border-white shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-semibold">{t('Brush Size:', 'حجم الفرشاة:')}</span>
            <input
              type="range"
              min="2"
              max="16"
              value={penWidth}
              onChange={e => setPenWidth(Number(e.target.value))}
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
        {/* Transform Box */}
        <div
          className="relative transition-transform duration-75 ease-out flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            width: '800px',
            height: '600px'
          }}
        >
          {/* Base SVG Educational Material */}
          <div
            className="w-full h-full pointer-events-none rounded-2xl overflow-hidden shadow-2xl border border-slate-800"
            dangerouslySetInnerHTML={{ __html: activeMaterial.content }}
          />

          {/* Interactive Annotation Canvas Overlay */}
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{ touchAction: 'none' }}
            className={`absolute inset-0 w-full h-full rounded-2xl touch-none ${
              mode === 'draw' || mode === 'erase' ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
            }`}
          />
        </div>
      </div>

      {/* Bottom Material Selector Ribbon */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-blue-400" /> {t('Study Sheets:', 'أوراق الشرح:')}
          </span>
          {SAMPLE_MATERIALS.map(mat => (
            <button
              key={mat.id}
              onClick={() => {
                setActiveMaterial(mat);
                handleResetZoom();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                activeMaterial.id === mat.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {language === 'ar' ? mat.titleAr : mat.titleEn}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 hidden md:block">
          {t('Scroll mouse wheel or drag to zoom/pan', 'استخدم عجلة الفأرة أو اسحب للتكبير والتحريك')}
        </p>
      </div>
    </div>
  );
}
