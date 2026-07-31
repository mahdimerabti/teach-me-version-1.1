import { useEffect, useRef, useState } from 'react';
import { Loader2, PhoneOff, ShieldAlert, Video, ZoomIn, Monitor, MessageSquare, Share2 } from 'lucide-react';
import ZoomViewerWidget from './ZoomViewerWidget';
import { buildJitsiOptions, logMeetingStart, logMeetingEnd } from '../lib/meetingService';

interface Props {
  roomId: string;
  userName: string;
  userAvatar?: string;
  userId?: string;
  isTutor: boolean;
  language: 'en' | 'ar' | 'fr';
  onClose: () => void;
}

export default function LiveMeetingRoom({
  roomId,
  userName,
  userAvatar,
  userId,
  isTutor,
  language,
  onClose
}: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'video' | 'zoom-tool'>('video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const jitsiApiRef = useRef<any>(null);
  const startTimeMsRef = useRef<number>(Date.now());
  const historyIdRef = useRef<string | null>(null);

  // 1. Dynamically load Jitsi External API script
  useEffect(() => {
    if (window.JitsiMeetExternalAPI) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      alert(t('Failed to load Jitsi video engine. Please check your connection.', 'فشل تحميل محرك الفيديو. يرجى التحقق من اتصالك بالإنترنت.'));
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // 2. Instantiate Jitsi Meet External API & log session start
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current) return;

    setLoading(true);
    startTimeMsRef.current = Date.now();

    // Log meeting start in Supabase database
    if (userId) {
      logMeetingStart(roomId, userId, isTutor ? 'tutor' : 'student')
        .then(id => { historyIdRef.current = id; })
        .catch(() => {});
    }

    const options = buildJitsiOptions({
      roomId,
      userName,
      userAvatar,
      isTutor,
      container: containerRef.current,
      language
    });

    // Safety fallback: auto-dismiss loading indicator after 1 second maximum to ensure ultra-fast join
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 1000);

    try {
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', options);
      jitsiApiRef.current = api;

      // Add full iframe permissions for camera, microphone & WebRTC in mobile WebView
      const iframe = api.getIFrame();
      if (iframe) {
        iframe.setAttribute('allow', 'camera; microphone; display-capture; autoplay; clipboard-write; speaker; microphone *; camera *; fullscreen');
      }

      api.addEventListener('videoConferenceJoined', () => {
        setLoading(false);
        // Unmute audio smoothly after room is established to prevent WebRTC lockup
        setTimeout(() => {
          try {
            api.executeCommand('toggleAudio');
          } catch (_) {}
        }, 400);
      });

      api.addEventListener('screenSharingStatusChanged', (event: { on: boolean }) => {
        setIsScreenSharing(event.on);
      });

      api.addEventListener('readyToClose', () => {
        handleLeaveRoom();
      });

      api.addEventListener('videoConferenceLeft', () => {
        handleLeaveRoom();
      });
    } catch (err) {
      console.error('Error initializing Jitsi Meet API:', err);
      setLoading(false);
    }

    return () => {
      clearTimeout(loadingTimeout);
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch (_) {}
      }
    };
  }, [scriptLoaded, roomId]);

  const handleLeaveRoom = async () => {
    if (historyIdRef.current) {
      await logMeetingEnd(historyIdRef.current, startTimeMsRef.current);
    }
    onClose();
  };

  const toggleScreenShare = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('toggleShareScreen');
    }
  };

  const toggleChat = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('toggleChat');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white font-sans antialiased select-none w-screen h-screen overflow-hidden">
      {/* Top Bar Header */}
      <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-3 md:px-6 py-2 md:py-3 flex flex-wrap items-center justify-between gap-2 md:gap-3 sticky top-0 z-20 w-full">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-sm md:text-lg font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-teal-400 bg-clip-text text-transparent">
            {t('Teach Me Classroom', 'علمني - القاعة الافتراضية')}
          </span>
          <span className={`text-[9px] md:text-xs px-2 py-0.5 md:px-2.5 md:py-1 rounded-full font-extrabold uppercase tracking-wider ${
            isTutor ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
          }`}>
            {isTutor ? t('Tutor / Host', 'الأستاذ / المحاضر') : t('Student', 'الطالب')}
          </span>
          {isScreenSharing && (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <Monitor className="w-3 h-3" /> {t('Sharing Screen', 'مشاركة الشاشة')}
            </span>
          )}
        </div>

        {/* Workspace View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('video')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'video' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" /> {t('Live Video', 'المكالمة المباشرة')}
          </button>
          <button
            onClick={() => setActiveTab('zoom-tool')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'zoom-tool' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" /> {t('Whiteboard & Sheet Tool', 'أداة الشرح والسبورة')}
          </button>
        </div>
        
        {/* Quick Toolbar Shortcuts & Leave Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {activeTab === 'video' && (
            <>
              <button
                onClick={toggleScreenShare}
                className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl transition-all border border-slate-700"
                title={t('Share Screen', 'مشاركة الشاشة')}
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={toggleChat}
                className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl transition-all border border-slate-700"
                title={t('In-meeting Chat', 'دردشة اللقاء')}
              >
                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </>
          )}

          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-[11px] sm:text-xs transition-all shadow-lg shadow-red-900/30"
          >
            <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t('End Call', 'إنهاء')}
          </button>
        </div>
      </div>

      {/* Main Workspace Container */}
      <div className="flex-1 w-full h-full flex overflow-hidden relative min-h-0">
        <div className={`flex-1 w-full h-full flex overflow-hidden ${activeTab === 'video' ? 'flex' : 'hidden'}`}>
          <div className="flex-1 w-full h-full relative bg-slate-950 flex items-center justify-center min-h-[300px]">
            {loading && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/90 border border-blue-500/40 text-blue-300 text-xs font-semibold px-4 py-2 rounded-full shadow-xl backdrop-blur animate-pulse pointer-events-none">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span>{t('Initializing video session...', 'جاري تهيئة الاتصال المباشر...')}</span>
              </div>
            )}
            <div ref={containerRef} className="w-full h-full min-h-[300px] flex-1" style={{ width: '100%', height: '100%', minHeight: '100%' }} />
          </div>

          {/* Guidelines & Details Side Panel */}
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex-col overflow-y-auto p-5 space-y-5 hidden lg:flex text-slate-300">
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">{t('Classroom Information', 'معلومات الفصل')}</h3>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase font-bold">{t('Room Token', 'رمز القاعة')}</p>
                  <p className="font-mono font-bold text-blue-400 truncate mt-0.5">{roomId}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase font-bold">{t('Participant', 'المستخدم الحاضر')}</p>
                  <p className="font-bold text-slate-200 mt-0.5">{userName}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">{t('Controls Guide', 'دليل الأزرار والتحكم')}</h3>
              <ul className="text-xs text-slate-400 space-y-2.5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>{t('Use the Screen Share button to stream slides or desktop applications.', 'استخدم زر مشاركة الشاشة لعرض العروض التقديمية أو التطبيقات.')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full mt-1.5 flex-shrink-0" />
                  <span>{t('Click "Whiteboard & Sheet Tool" tab above to draw on study documents without disconnecting audio.', 'اضغط على "أداة الشرح والسبورة" للرسم دون قطع الصوت.')}</span>
                </li>
                {isTutor && (
                  <li className="flex items-start gap-2 text-indigo-300 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-900/50">
                    <ShieldAlert className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <span>{t('Moderator Rights: You can manage participant microphones and approve lobby join requests.', 'صلاحية الأستاذ: يمكنك كتم الميكروفونات وقبول طلبات الدخول.')}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Interactive Whiteboard Tool Overlay (preserves WebRTC call state) */}
        <div className={`flex-1 w-full h-full p-2 bg-slate-950 ${activeTab === 'zoom-tool' ? 'block' : 'hidden'}`}>
          <ZoomViewerWidget language={language} isEmbedded={true} />
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}
