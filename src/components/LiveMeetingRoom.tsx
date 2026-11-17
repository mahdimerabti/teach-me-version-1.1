import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  Hand,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Pin,
  RefreshCw,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  Users,
  Video,
  VolumeX,
  X,
  ZoomIn
} from 'lucide-react';
import ZoomViewerWidget from './ZoomViewerWidget';
import {
  LiveRoomController,
  isNativeDisplayMediaSupported,
  logMeetingEnd,
  logMeetingStart,
  type RoomChatMessage,
  type RoomParticipantState,
  type WhiteboardSyncEvent
} from '../lib/meetingService';

interface Props {
  roomId: string;
  userName: string;
  userAvatar?: string;
  userId?: string;
  isTutor: boolean;
  language: 'en' | 'ar' | 'fr';
  onClose: () => void;
}

function VideoStreamTile({
  stream,
  muted = false,
  mirror = false,
  participant,
  isLocal = false,
  isPinned = false,
  onTogglePin,
  language
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  participant: RoomParticipantState;
  isLocal?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  language: 'en' | 'ar' | 'fr';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const t = (en: string, ar: string, fr?: string) =>
    language === 'ar' ? ar : language === 'fr' ? fr || en : en;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream, participant.isCameraOff, participant.isSharingScreen]);

  const hasLiveVideo =
    Boolean(stream) &&
    stream!.getVideoTracks().length > 0 &&
    (!participant.isCameraOff || participant.isSharingScreen);

  const initials = (participant.displayName || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative w-full h-full min-h-[180px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl group flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full ${
          participant.isSharingScreen ? 'object-contain bg-slate-950' : 'object-cover'
        } ${mirror && !participant.isSharingScreen ? '-scale-x-100' : ''} ${
          hasLiveVideo ? 'block' : 'hidden'
        }`}
      />

      {!hasLiveVideo && (
        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.displayName}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-blue-500/40 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-2xl sm:text-3xl font-black text-white shadow-lg border border-blue-400/30">
              {initials}
            </div>
          )}
          <span className="text-xs text-slate-400 font-medium">
            {participant.isCameraOff
              ? t('Camera is off', 'الكاميرا مغلقة', 'Caméra désactivée')
              : t('Audio connected', 'متصل صوتياً', 'Audio connecté')}
          </span>
        </div>
      )}

      {/* Top Badges */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md border ${
              participant.role === 'host'
                ? 'bg-indigo-600/80 text-white border-indigo-400/40'
                : 'bg-slate-900/80 text-blue-300 border-slate-700'
            }`}
          >
            {participant.role === 'host'
              ? t('Tutor / Host', 'الأستاذ / المضيف', 'Professeur')
              : t('Student', 'طالب', 'Étudiant')}
          </span>

          {participant.isSharingScreen && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/90 text-white flex items-center gap-1 shadow">
              <Monitor className="w-3 h-3" /> {t('Screen / Board', 'مشاركة الشاشة')}
            </span>
          )}

          {participant.isHandRaised && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950 flex items-center gap-1 animate-bounce shadow-lg">
              ✋ {t('Hand Raised', 'يرفع يده')}
            </span>
          )}
        </div>

        {onTogglePin && (
          <button
            onClick={onTogglePin}
            className="pointer-events-auto p-1.5 rounded-xl bg-slate-900/80 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700/80 transition-all opacity-90 group-hover:opacity-100"
            title={t('Pin Video', 'تثبيت الفيديو')}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current text-blue-400' : ''}`} />
          </button>
        )}
      </div>

      {/* Bottom Name & Mic Bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-xl max-w-[85%]">
          {participant.isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-xs font-bold text-white truncate">
            {participant.displayName} {isLocal ? `(${t('You', 'أنت', 'Vous')})` : ''}
          </span>
        </div>
      </div>
    </div>
  );
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
  const t = (en: string, ar: string, fr?: string) =>
    language === 'ar' ? ar : language === 'fr' ? fr || en : en;

  const [localUserId] = useState(
    () => userId || `guest-${Math.random().toString(36).slice(2, 10)}`
  );

  const [activeTab, setActiveTab] = useState<'video' | 'zoom-tool'>('video');
  const [sidePanel, setSidePanel] = useState<'none' | 'chat' | 'participants'>('none');
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting');
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  // Local media controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isStreamingCanvas, setIsStreamingCanvas] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Streams & Participants
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participants, setParticipants] = useState<RoomParticipantState[]>([]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [incomingWhiteboardEvent, setIncomingWhiteboardEvent] =
    useState<WhiteboardSyncEvent | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<
    Array<{ id: string; emoji: string; senderName: string }>
  >([]);

  const controllerRef = useRef<LiveRoomController | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const startTimeMsRef = useRef<number>(Date.now());
  const historyIdRef = useRef<string | null>(null);
  const sidePanelRef = useRef<'none' | 'chat' | 'participants'>('none');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sidePanelRef.current = sidePanel;
    if (sidePanel === 'chat') {
      setUnreadCount(0);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [sidePanel]);

  // Call duration timer
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeMsRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  // Acquire camera + microphone with graceful fallback for Android WebView & permissions
  const acquireMediaStream = useCallback(
    async (targetFacingMode: 'user' | 'environment'): Promise<MediaStream | null> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMediaNotice(
          t(
            'Camera/Microphone API unavailable in this browser context.',
            'واجهة الكاميرا والميكروفون غير متاحة في هذا المتصفح.'
          )
        );
        return null;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: {
            facingMode: targetFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        setMediaNotice(null);
        return stream;
      } catch (_errVideo) {
        // Fallback to audio-only if camera is busy or unavailable
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: false
          });
          setIsCameraOff(true);
          setMediaNotice(
            t(
              'Joined with microphone only (camera unavailable).',
              'تم الانضمام بالميكروفون فقط (الكاميرا غير متاحة).'
            )
          );
          return audioOnlyStream;
        } catch (_errAudio) {
          setIsMuted(true);
          setIsCameraOff(true);
          setMediaNotice(
            t(
              'Joined in view/listen mode. Grant Camera & Mic permissions to speak.',
              'تم الدخول بوضع المشاهدة والاستماع. يرجى منح صلاحية الكاميرا والميكروفون للتحدث.'
            )
          );
          return null;
        }
      }
    },
    [language]
  );

  // Initialize room session & WebRTC signaling
  useEffect(() => {
    let mounted = true;
    startTimeMsRef.current = Date.now();

    if (userId) {
      logMeetingStart(roomId, userId, isTutor ? 'tutor' : 'student')
        .then((id) => {
          historyIdRef.current = id;
        })
        .catch(() => {});
    }

    const controller = new LiveRoomController(
      roomId,
      {
        userId: localUserId,
        displayName: userName || (isTutor ? 'Tutor' : 'Student'),
        avatarUrl: userAvatar,
        role: isTutor ? 'host' : 'student',
        isMuted: false,
        isCameraOff: false,
        isHandRaised: false,
        isSharingScreen: false
      },
      {
        onParticipantsChanged: (list) => {
          if (!mounted) return;
          setParticipants(list);
        },
        onRemoteStreamChanged: (peerId, stream) => {
          if (!mounted) return;
          setRemoteStreams((prev) => {
            const next = { ...prev };
            if (stream) {
              next[peerId] = stream;
            } else {
              delete next[peerId];
            }
            return next;
          });
        },
        onChatMessage: (msg) => {
          if (!mounted) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (sidePanelRef.current !== 'chat' && msg.senderId !== localUserId) {
            setUnreadCount((c) => c + 1);
          }
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
        },
        onWhiteboardSync: (event) => {
          if (!mounted) return;
          setIncomingWhiteboardEvent(event);
        },
        onActiveModeChanged: (mode) => {
          if (!mounted) return;
          if (mode === 'whiteboard') {
            setActiveTab('zoom-tool');
          } else {
            setActiveTab('video');
          }
        },
        onHostCommand: (cmd) => {
          if (!mounted) return;
          if (
            cmd.type === 'mute-all' ||
            (cmd.type === 'mute-user' && cmd.targetUserId === localUserId)
          ) {
            if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach((tr) => {
                tr.enabled = false;
              });
            }
            setIsMuted(true);
            controller.updateLocalState({ isMuted: true });
          } else if (cmd.type === 'lower-hand' && cmd.targetUserId === localUserId) {
            setIsHandRaised(false);
            controller.updateLocalState({ isHandRaised: false });
          } else if (cmd.type === 'end-room') {
            handleLeaveRoom();
          }
        },
        onReaction: (rx) => {
          if (!mounted) return;
          setFloatingReactions((prev) => [...prev, rx]);
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((item) => item.id !== rx.id));
          }, 3200);
        },
        onConnectionStateChanged: (st) => {
          if (!mounted) return;
          setConnectionState(st);
        }
      }
    );

    controllerRef.current = controller;

    acquireMediaStream('user').then((stream) => {
      if (!mounted) {
        stream?.getTracks().forEach((tr) => tr.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      controller.connect(stream);
    });

    return () => {
      mounted = false;
      controller.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, [roomId, localUserId]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    setIsMuted(nextMuted);
    controllerRef.current?.updateLocalState({ isMuted: nextMuted });
  };

  const toggleCamera = () => {
    const nextCamOff = !isCameraOff;
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextCamOff;
      });
    }
    setIsCameraOff(nextCamOff);
    controllerRef.current?.updateLocalState({ isCameraOff: nextCamOff });
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack && localStreamRef.current) {
        const oldVideoTracks = localStreamRef.current.getVideoTracks();
        oldVideoTracks.forEach((tr) => {
          localStreamRef.current?.removeTrack(tr);
          tr.stop();
        });
        localStreamRef.current.addTrack(newVideoTrack);
        setFacingMode(nextFacing);
        setIsCameraOff(false);
        await controllerRef.current?.replaceOutgoingVideoTrack(newVideoTrack);
        controllerRef.current?.updateLocalState({ isCameraOff: false });
      }
    } catch (_) {
      // Fallback if device only has one camera
      setFacingMode(nextFacing);
    }
  };

  const stopScreenSharing = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsSharingScreen(false);
    setIsStreamingCanvas(false);
    await controllerRef.current?.replaceOutgoingVideoTrack(null);
    controllerRef.current?.updateLocalState({ isSharingScreen: false });
  }, []);

  const startCanvasBoardStream = useCallback(async () => {
    setActiveTab('zoom-tool');
    controllerRef.current?.broadcastActiveMode('whiteboard');

    const cStream = canvasStreamRef.current;
    const videoTrack = cStream?.getVideoTracks()[0] || null;
    if (videoTrack) {
      setIsSharingScreen(true);
      setIsStreamingCanvas(true);
      await controllerRef.current?.replaceOutgoingVideoTrack(videoTrack);
      controllerRef.current?.updateLocalState({ isSharingScreen: true });
    }
  }, []);

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      await stopScreenSharing();
      return;
    }

    // 1. Try native getDisplayMedia on desktop browsers
    if (isNativeDisplayMediaSupported()) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 25, max: 30 } },
          audio: true
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          screenStreamRef.current = displayStream;
          setScreenStream(displayStream);
          setIsSharingScreen(true);
          screenTrack.onended = () => {
            stopScreenSharing();
          };
          await controllerRef.current?.replaceOutgoingVideoTrack(screenTrack);
          controllerRef.current?.updateLocalState({ isSharingScreen: true });
          controllerRef.current?.broadcastActiveMode('screenshare');
          return;
        }
      } catch (_) {
        // User cancelled or WebView blocked getDisplayMedia -> fallback to Synced Whiteboard stream
      }
    }

    // 2. Android WebView Compatible Screen Share: Switch to Realtime Synced Whiteboard & stream Canvas Track
    await startCanvasBoardStream();
  };

  const toggleRaiseHand = () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    controllerRef.current?.updateLocalState({ isHandRaised: nextHand });
    if (nextHand) {
      controllerRef.current?.sendReaction('✋');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !controllerRef.current) return;
    setChatInput('');
    const sent = await controllerRef.current.sendChatMessage(trimmed, 'text');
    setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleLeaveRoom = async () => {
    if (historyIdRef.current) {
      await logMeetingEnd(historyIdRef.current, startTimeMsRef.current);
    }
    await controllerRef.current?.disconnect();
    onClose();
  };

  const handleEndRoomForAll = async () => {
    controllerRef.current?.broadcastHostCommand({ type: 'end-room' });
    await handleLeaveRoom();
  };

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(roomId).catch(() => {});
    setCopiedRoomId(true);
    setTimeout(() => setCopiedRoomId(false), 2000);
  };

  const localParticipant: RoomParticipantState = {
    userId: localUserId,
    displayName: userName || (isTutor ? 'Tutor' : 'Student'),
    avatarUrl: userAvatar,
    role: isTutor ? 'host' : 'student',
    isMuted,
    isCameraOff,
    isHandRaised,
    isSharingScreen,
    isOnline: true,
    joinedAt: ''
  };

  const remoteParticipants = participants.filter((p) => p.userId !== localUserId);
  const allParticipants = [localParticipant, ...remoteParticipants];
  const pinnedParticipant = allParticipants.find((p) => p.userId === pinnedUserId) || null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white font-sans antialiased select-none w-screen h-screen overflow-hidden">
      {/* Floating Emoji Reactions */}
      <div className="fixed bottom-24 left-6 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {floatingReactions.map((rx) => (
          <div
            key={rx.id}
            className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-full shadow-2xl animate-bounce"
          >
            <span className="text-xl">{rx.emoji}</span>
            <span className="text-xs font-bold text-slate-200">{rx.senderName}</span>
          </div>
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="text-sm md:text-base font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-teal-400 bg-clip-text text-transparent">
              {t('Teach Me Live Classroom', 'علمني - القاعة الافتراضية المباشرة')}
            </span>
          </div>

          <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-lg">
            {formatDuration(elapsedSeconds)}
          </span>

          <button
            onClick={copyRoomCode}
            className="hidden sm:flex items-center gap-1 text-[11px] bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition-all"
            title={t('Copy Room ID', 'نسخ رمز القاعة')}
          >
            {copiedRoomId ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-bold">{t('Copied', 'تم النسخ')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span className="font-mono">{roomId.slice(0, 14)}</span>
              </>
            )}
          </button>
        </div>

        {/* Workspace Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => {
              setActiveTab('video');
              if (isTutor) controllerRef.current?.broadcastActiveMode('video');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'video'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{t('Video Grid', 'شبكة الفيديو')}</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('zoom-tool');
              if (isTutor) controllerRef.current?.broadcastActiveMode('whiteboard');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'zoom-tool'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>{t('Synced Whiteboard', 'السبورة المتزامنة')}</span>
          </button>
        </div>

        {/* Role & Participant Count */}
        <div className="hidden md:flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider ${
              isTutor
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {isTutor ? t('Tutor / Host', 'الأستاذ / المحاضر') : t('Student', 'الطالب')}
          </span>
        </div>
      </div>

      {/* Optional Media Permission Notice Banner */}
      {mediaNotice && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between text-amber-200 text-xs z-20">
          <span>{mediaNotice}</span>
          <button
            onClick={() => setMediaNotice(null)}
            className="text-amber-300 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Stage + Optional Side Drawer */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Stage Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 p-2 sm:p-4">
          {activeTab === 'video' ? (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {pinnedParticipant ? (
                /* Pinned / Spotlight Layout */
                <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
                  <div className="flex-1 min-h-[260px]">
                    <VideoStreamTile
                      stream={
                        pinnedParticipant.userId === localUserId
                          ? screenStream || localStream
                          : remoteStreams[pinnedParticipant.userId] || null
                      }
                      muted={pinnedParticipant.userId === localUserId}
                      mirror={
                        pinnedParticipant.userId === localUserId && facingMode === 'user'
                      }
                      participant={pinnedParticipant}
                      isLocal={pinnedParticipant.userId === localUserId}
                      isPinned={true}
                      onTogglePin={() => setPinnedUserId(null)}
                      language={language}
                    />
                  </div>
                  <div className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-y-auto lg:w-64 h-36 lg:h-full">
                    {allParticipants
                      .filter((p) => p.userId !== pinnedParticipant.userId)
                      .map((p) => (
                        <div key={p.userId} className="w-48 lg:w-full h-full lg:h-44 flex-shrink-0">
                          <VideoStreamTile
                            stream={
                              p.userId === localUserId
                                ? screenStream || localStream
                                : remoteStreams[p.userId] || null
                            }
                            muted={p.userId === localUserId}
                            mirror={p.userId === localUserId && facingMode === 'user'}
                            participant={p}
                            isLocal={p.userId === localUserId}
                            isPinned={false}
                            onTogglePin={() => setPinnedUserId(p.userId)}
                            language={language}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                /* Responsive Zoom-Style Video Grid */
                <div
                  className={`flex-1 grid gap-3 min-h-0 ${
                    remoteParticipants.length === 0
                      ? 'grid-cols-1 md:grid-cols-2'
                      : remoteParticipants.length === 1
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {/* Local Video Tile */}
                  <VideoStreamTile
                    stream={screenStream || localStream}
                    muted={true}
                    mirror={facingMode === 'user' && !screenStream}
                    participant={localParticipant}
                    isLocal={true}
                    onTogglePin={() => setPinnedUserId(localUserId)}
                    language={language}
                  />

                  {/* Remote Participant Tiles */}
                  {remoteParticipants.map((remote) => (
                    <VideoStreamTile
                      key={remote.userId}
                      stream={remoteStreams[remote.userId] || null}
                      muted={false}
                      mirror={false}
                      participant={remote}
                      isLocal={false}
                      onTogglePin={() => setPinnedUserId(remote.userId)}
                      language={language}
                    />
                  ))}

                  {/* Waiting for Other Party Card when Alone in Room */}
                  {remoteParticipants.length === 0 && (
                    <div className="bg-slate-900/70 border border-dashed border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
                      </div>
                      <div className="space-y-1 max-w-sm">
                        <h3 className="text-base font-bold text-white">
                          {isTutor
                            ? t('Waiting for student to join...', 'بانتظار انضمام الطالب إلى الحصة...')
                            : t('Waiting for tutor to join...', 'بانتظار انضمام الأستاذ إلى الحصة...')}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {t(
                            'Your camera, microphone, and interactive whiteboard are ready. As soon as the other participant joins this room, live video & audio will connect automatically.',
                            'الكاميرا والميكروفون والسبورة التفاعلية جاهزة. بمجرد دخول الطرف الآخر إلى نفس الغرفة سيتم الربط الصوتي والمرئي تلقائياً.'
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={() => setActiveTab('zoom-tool')}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all"
                        >
                          <ZoomIn className="w-4 h-4" />
                          <span>{t('Open Interactive Whiteboard', 'فتح السبورة التفاعلية')}</span>
                        </button>
                        <button
                          onClick={copyRoomCode}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-all"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t('Copy Room ID', 'نسخ رمز الغرفة')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Synced Whiteboard Mode with Picture-in-Picture (PiP) Video Strip */
            <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 relative">
              <div className="flex-1 min-h-0 h-full">
                <ZoomViewerWidget
                  language={language}
                  isEmbedded={true}
                  currentUserId={localUserId}
                  currentUserName={localParticipant.displayName}
                  onBroadcastEvent={(ev) => controllerRef.current?.broadcastWhiteboardEvent(ev)}
                  incomingSyncEvent={incomingWhiteboardEvent}
                  onCanvasStreamReady={(cStream) => {
                    canvasStreamRef.current = cStream;
                  }}
                  isStreamingCanvas={isStreamingCanvas}
                  onToggleStreamCanvas={() => {
                    if (isStreamingCanvas) {
                      stopScreenSharing();
                    } else {
                      startCanvasBoardStream();
                    }
                  }}
                />
              </div>

              {/* Floating / Side Picture-in-Picture Cameras while using Whiteboard */}
              <div className="flex lg:flex-col gap-2.5 h-32 lg:h-full lg:w-60 overflow-x-auto lg:overflow-y-auto flex-shrink-0">
                <div className="w-44 lg:w-full h-full lg:h-40 flex-shrink-0">
                  <VideoStreamTile
                    stream={localStream}
                    muted={true}
                    mirror={facingMode === 'user'}
                    participant={localParticipant}
                    isLocal={true}
                    language={language}
                  />
                </div>
                {remoteParticipants.map((remote) => (
                  <div key={remote.userId} className="w-44 lg:w-full h-full lg:h-40 flex-shrink-0">
                    <VideoStreamTile
                      stream={remoteStreams[remote.userId] || null}
                      muted={false}
                      participant={remote}
                      isLocal={false}
                      language={language}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Side Drawer: Participants & Host Controls OR Live Chat */}
        {sidePanel !== 'none' && (
          <div className="w-full sm:w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 absolute sm:relative inset-y-0 right-0 shadow-2xl">
            {/* Drawer Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidePanel('participants')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    sidePanel === 'participants'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {t('Participants', 'المشاركون')} ({allParticipants.length})
                  </span>
                </button>
                <button
                  onClick={() => setSidePanel('chat')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    sidePanel === 'chat'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t('Live Chat', 'الدردشة')}</span>
                </button>
              </div>
              <button
                onClick={() => setSidePanel('none')}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sidePanel === 'participants' ? (
              /* Participants List & Host Controls */
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isTutor && (
                  <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-bold">
                      <ShieldAlert className="w-4 h-4" />
                      <span>{t('Host Controls', 'أدوات تحكم الأستاذ')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() =>
                          controllerRef.current?.broadcastHostCommand({ type: 'mute-all' })
                        }
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-semibold flex items-center gap-1 border border-slate-700"
                      >
                        <VolumeX className="w-3.5 h-3.5 text-red-400" />
                        <span>{t('Mute All', 'كتم الجميع')}</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('zoom-tool');
                          controllerRef.current?.broadcastActiveMode('whiteboard');
                        }}
                        className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-xl text-[11px] font-semibold flex items-center gap-1 border border-blue-500/30"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>{t('Focus Board for All', 'فتح السبورة للجميع')}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {allParticipants.map((p) => (
                    <div
                      key={p.userId}
                      className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                          {p.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {p.displayName}{' '}
                            {p.userId === localUserId ? `(${t('You', 'أنت')})` : ''}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {p.role === 'host'
                              ? t('Tutor / Host', 'الأستاذ / المضيف')
                              : t('Student', 'الطالب')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {p.isHandRaised && (
                          <button
                            onClick={() => {
                              if (isTutor) {
                                controllerRef.current?.broadcastHostCommand({
                                  type: 'lower-hand',
                                  targetUserId: p.userId
                                });
                              }
                            }}
                            className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-lg"
                            title={isTutor ? t('Lower Hand', 'إنزال اليد') : ''}
                          >
                            ✋
                          </button>
                        )}
                        {isTutor && p.userId !== localUserId && !p.isMuted && (
                          <button
                            onClick={() =>
                              controllerRef.current?.broadcastHostCommand({
                                type: 'mute-user',
                                targetUserId: p.userId
                              })
                            }
                            className="px-2 py-1 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded-lg text-[10px] font-bold"
                          >
                            {t('Mute', 'كتم')}
                          </button>
                        )}
                        {p.isMuted ? (
                          <MicOff className="w-4 h-4 text-red-400" />
                        ) : (
                          <Mic className="w-4 h-4 text-emerald-400" />
                        )}
                        {p.isCameraOff ? (
                          <CameraOff className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Camera className="w-4 h-4 text-blue-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* In-Room Live Chat */
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs gap-2">
                      <MessageSquare className="w-8 h-8 text-slate-700" />
                      <p>{t('No messages yet. Say hello!', 'لا توجد رسائل بعد. ابدأ المحادثة!')}</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === localUserId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <span className="text-[10px] text-slate-400 mb-0.5 px-1">
                            {msg.senderName} •{' '}
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div
                            className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={t('Type a message to the room...', 'اكتب رسالة في الغرفة...')}
                    className="flex-1 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Zoom-Style Control Bar */}
      <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-center sm:justify-between gap-2 z-30">
        {/* Left: Audio & Video Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={toggleMute}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              isMuted
                ? 'bg-red-600/20 text-red-400 border-red-500/40 hover:bg-red-600/30'
                : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
            <span className="hidden md:inline">
              {isMuted ? t('Unmute', 'إلغاء الكتم') : t('Mute', 'كتم الصوت')}
            </span>
          </button>

          <button
            onClick={toggleCamera}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              isCameraOff
                ? 'bg-red-600/20 text-red-400 border-red-500/40 hover:bg-red-600/30'
                : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isCameraOff ? (
              <CameraOff className="w-4 h-4" />
            ) : (
              <Camera className="w-4 h-4 text-blue-400" />
            )}
            <span className="hidden md:inline">
              {isCameraOff ? t('Start Video', 'تشغيل الكاميرا') : t('Stop Video', 'إيقاف الكاميرا')}
            </span>
          </button>

          <button
            onClick={flipCamera}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
            title={t('Switch Front/Back Camera', 'تبديل الكاميرا الأمامية/الخلفية')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Screen Share, Whiteboard, Hand, Reactions, Drawer Toggles */}
        <div className="flex items-center gap-1.5 sm:gap-2 relative">
          <button
            onClick={toggleScreenShare}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              isSharingScreen
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={t('Share Screen or Synced Whiteboard', 'مشاركة الشاشة أو السبورة')}
          >
            {isSharingScreen ? (
              <MonitorOff className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4 text-emerald-400" />
            )}
            <span className="hidden sm:inline">
              {isSharingScreen
                ? t('Stop Share', 'إيقاف المشاركة')
                : t('Share Screen', 'مشاركة الشاشة')}
            </span>
          </button>

          <button
            onClick={toggleRaiseHand}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              isHandRaised
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={t('Raise Hand', 'رفع اليد')}
          >
            <Hand className="w-4 h-4" />
            <span className="hidden lg:inline">
              {isHandRaised ? t('Lower Hand', 'إنزال اليد') : t('Raise Hand', 'رفع اليد')}
            </span>
          </button>

          {/* Emoji Reactions Picker */}
          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu((prev) => !prev)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
              title={t('Reactions', 'تفاعلات')}
            >
              <Smile className="w-4 h-4 text-amber-400" />
            </button>
            {showReactionsMenu && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-2xl z-50">
                {['👏', '👍', '🎉', '❤️', '💡', '✋'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      controllerRef.current?.sendReaction(emoji);
                      setShowReactionsMenu(false);
                    }}
                    className="text-lg hover:scale-125 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() =>
              setSidePanel((prev) => (prev === 'participants' ? 'none' : 'participants'))
            }
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              sidePanel === 'participants'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[11px]">{allParticipants.length}</span>
          </button>

          <button
            onClick={() => setSidePanel((prev) => (prev === 'chat' ? 'none' : 'chat'))}
            className={`relative px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              sidePanel === 'chat'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden md:inline">{t('Chat', 'الدردشة')}</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] font-black rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Leave / End Meeting */}
        <div className="flex items-center gap-1.5">
          {isTutor && (
            <button
              onClick={handleEndRoomForAll}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60 font-bold rounded-xl text-xs transition-all"
              title={t('End session for all participants', 'إنهاء الحصة للجميع')}
            >
              <span>{t('End for All', 'إنهاء للجميع')}</span>
            </button>
          )}
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-red-900/30"
          >
            <PhoneOff className="w-4 h-4" />
            <span>{t('Leave', 'مغادرة')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
