import { useEffect, useRef, useState, useCallback } from 'react';
import { makeT } from '../i18n';
import {
  Award,
  Camera,
  CameraOff,
  Check,
  Copy,
  Hand,
  Heart,
  Lightbulb,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PenTool,
  PhoneOff,
  Pin,
  RefreshCw,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
  Video,
  VolumeX,
  X
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

const REACTION_ITEMS = [
  { id: 'thumbs-up', label: 'Thumbs Up', Icon: ThumbsUp, color: 'text-blue-600' },
  { id: 'heart', label: 'Heart', Icon: Heart, color: 'text-rose-500' },
  { id: 'sparkles', label: 'Great', Icon: Sparkles, color: 'text-amber-500' },
  { id: 'lightbulb', label: 'Idea', Icon: Lightbulb, color: 'text-amber-600' },
  { id: 'award', label: 'Bravo', Icon: Award, color: 'text-indigo-600' },
  { id: 'hand', label: 'Hand', Icon: Hand, color: 'text-emerald-600' }
] as const;

function renderReactionIcon(key: string) {
  const found = REACTION_ITEMS.find((item) => item.id === key);
  const Icon = found ? found.Icon : Sparkles;
  const color = found ? found.color : 'text-blue-600';
  return <Icon className={`w-4 h-4 ${color}`} />;
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
  const t = makeT(language);

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
    <div className="relative w-full h-full min-h-[160px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 shadow-sm group flex items-center justify-center">
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
        <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.displayName}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/25 shadow-md"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl sm:text-2xl font-bold text-white shadow-md border-2 border-white/20">
              {initials}
            </div>
          )}
          <span className="text-xs text-slate-300 font-medium">
            {participant.isCameraOff
              ? t('Camera is off', 'الكاميرا مغلقة', 'Caméra désactivée')
              : t('Audio connected', 'متصل صوتياً', 'Audio connecté')}
          </span>
        </div>
      )}

      {/* Top Badges */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${
              participant.role === 'host'
                ? 'bg-blue-600/90 text-white border-blue-400/40'
                : 'bg-slate-900/75 text-slate-100 border-white/15'
            }`}
          >
            {participant.role === 'host'
              ? t('Teacher', 'الأستاذ', 'Professeur')
              : t('Student', 'طالب', 'Étudiant')}
          </span>

          {participant.isSharingScreen && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/90 text-white flex items-center gap-1 shadow">
              <Monitor className="w-3 h-3" /> {t('Sharing', 'مشاركة الشاشة', 'Partage')}
            </span>
          )}

          {participant.isHandRaised && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 flex items-center gap-1 shadow">
              <Hand className="w-3 h-3" /> {t('Hand Raised', 'يرفع يده', 'Main levée')}
            </span>
          )}
        </div>

        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className="pointer-events-auto p-1.5 rounded-xl bg-slate-900/70 hover:bg-blue-600 text-white border border-white/15 transition-all opacity-90 group-hover:opacity-100"
            title={t('Pin Video', 'تثبيت الفيديو', 'Épingler')}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current text-blue-300' : ''}`} />
          </button>
        )}
      </div>

      {/* Bottom Name & Mic Bar */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-950/75 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-xl max-w-[85%]">
          {participant.isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-white truncate">
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
  const t = makeT(language);

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

  // Teacher-controlled Whiteboard Drawing Permissions
  const [allowedDrawers, setAllowedDrawers] = useState<string[]>(() =>
    isTutor ? [localUserId] : []
  );
  const [togglingDrawUserId, setTogglingDrawUserId] = useState<string | null>(null);
  const [permissionToast, setPermissionToast] = useState<string | null>(null);
  const prevStudentCanDrawRef = useRef<boolean>(isTutor);

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

  const localCanDraw = isTutor || allowedDrawers.includes(localUserId);

  // Notify student smoothly when their whiteboard drawing access changes in real time
  useEffect(() => {
    if (isTutor) return;
    if (prevStudentCanDrawRef.current !== localCanDraw) {
      prevStudentCanDrawRef.current = localCanDraw;
      setPermissionToast(
        localCanDraw
          ? t(
              'The teacher allowed you to draw on the whiteboard.',
              'سمح لك الأستاذ بالرسم على السبورة.',
              'Le professeur vous a autorisé à dessiner.'
            )
          : t(
              'Whiteboard drawing access was revoked (view-only).',
              'تم إلغاء صلاحية الرسم على السبورة (للعرض فقط).',
              'L\'accès au dessin a été retiré (lecture seule).'
            )
      );
      const timer = window.setTimeout(() => setPermissionToast(null), 3500);
      return () => window.clearTimeout(timer);
    }
  }, [localCanDraw, isTutor, language]);

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
        canDraw: isTutor,
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
        onDrawingPermissionsChanged: (allowedIds) => {
          if (!mounted) return;
          setAllowedDrawers(allowedIds);
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
    if (isTutor) {
      controllerRef.current?.broadcastActiveMode('whiteboard');
    }

    const cStream = canvasStreamRef.current;
    const videoTrack = cStream?.getVideoTracks()[0] || null;
    if (videoTrack) {
      setIsSharingScreen(true);
      setIsStreamingCanvas(true);
      await controllerRef.current?.replaceOutgoingVideoTrack(videoTrack);
      controllerRef.current?.updateLocalState({ isSharingScreen: true });
    }
  }, [isTutor]);

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      await stopScreenSharing();
      return;
    }

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
          if (isTutor) {
            controllerRef.current?.broadcastActiveMode('screenshare');
          }
          return;
        }
      } catch (_) {}
    }

    await startCanvasBoardStream();
  };

  const toggleRaiseHand = () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    controllerRef.current?.updateLocalState({ isHandRaised: nextHand });
    if (nextHand) {
      controllerRef.current?.sendReaction('hand');
    }
  };

  const handleToggleStudentDraw = async (studentId: string, currentlyAllowed: boolean) => {
    if (!isTutor || !controllerRef.current) return;
    setTogglingDrawUserId(studentId);
    try {
      await controllerRef.current.setStudentDrawPermission(studentId, !currentlyAllowed);
    } finally {
      setTogglingDrawUserId(null);
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
    const shareUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/?room=${encodeURIComponent(roomId)}`
        : roomId;
    navigator.clipboard?.writeText(shareUrl).catch(() => {
      navigator.clipboard?.writeText(roomId).catch(() => {});
    });
    setCopiedRoomId(true);
    setTimeout(() => setCopiedRoomId(false), 2000);
  };

  const localParticipant: RoomParticipantState = {
    userId: localUserId,
    displayName: userName || (isTutor ? 'Tutor' : 'Student'),
    avatarUrl: userAvatar,
    role: isTutor ? 'host' : 'student',
    canDraw: localCanDraw,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900 font-sans antialiased select-none w-screen h-[100dvh] overflow-hidden">
      {/* Floating Vector Reactions */}
      <div className="fixed bottom-24 left-4 sm:left-6 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        {floatingReactions.map((rx) => (
          <div
            key={rx.id}
            className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-lg animate-bounce"
          >
            {renderReactionIcon(rx.emoji)}
            <span className="text-xs font-semibold text-slate-800">{rx.senderName}</span>
          </div>
        ))}
      </div>

      {/* Live Permission Toast Notification */}
      {permissionToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-white border border-blue-200 text-slate-800 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold">
          <PenTool className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>{permissionToast}</span>
        </div>
      )}

      {/* Top Header Bar (Clean White + Blue, safe-area aware) */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-3 md:px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2.5 flex flex-wrap items-center justify-between gap-2 z-30 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 truncate">
                  {t('Teach Me Classroom', 'قاعة علمني المباشرة', 'Classe en direct')}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                    connectionState === 'connected'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                  </span>
                  {connectionState === 'connected'
                    ? t('Live', 'مباشر', 'En direct')
                    : t('Connecting', 'جاري الاتصال', 'Connexion')}
                </span>
              </div>
            </div>
          </div>

          <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200/80 px-2 py-0.5 rounded-lg">
            {formatDuration(elapsedSeconds)}
          </span>

          <button
            type="button"
            onClick={copyRoomCode}
            className="hidden sm:flex items-center gap-1.5 text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg transition-all"
            title={t('Copy Invite Link', 'نسخ رابط القاعة', 'Copier le lien')}
          >
            {copiedRoomId ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">{t('Copied', 'تم النسخ', 'Copié')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono text-slate-600">{roomId.slice(0, 12)}</span>
              </>
            )}
          </button>
        </div>

        {/* Workspace Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('video');
              if (isTutor) controllerRef.current?.broadcastActiveMode('video');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'video'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{t('Video', 'الفيديو', 'Vidéo')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('zoom-tool');
              if (isTutor) controllerRef.current?.broadcastActiveMode('whiteboard');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'zoom-tool'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{t('Whiteboard', 'السبورة', 'Tableau blanc')}</span>
          </button>
        </div>

        {/* Role & Participant Count */}
        <div className="hidden md:flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            {allParticipants.length}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              isTutor
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isTutor ? t('Teacher', 'الأستاذ', 'Professeur') : t('Student', 'الطالب', 'Étudiant')}
          </span>
        </div>
      </header>

      {/* Optional Media Permission Notice Banner */}
      {mediaNotice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-amber-800 text-xs font-medium z-20">
          <span>{mediaNotice}</span>
          <button
            type="button"
            onClick={() => setMediaNotice(null)}
            className="text-amber-600 hover:text-amber-900 p-0.5 rounded"
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
                <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
                  <div className="flex-1 min-h-[240px]">
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

                  {/* Clean White Waiting Card when Alone */}
                  {remoteParticipants.length === 0 && (
                    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <Users className="w-7 h-7 text-blue-600" />
                      </div>
                      <div className="space-y-1.5 max-w-sm">
                        <h3 className="text-base font-bold text-slate-900">
                          {isTutor
                            ? t('Waiting for students to join...', 'بانتظار انضمام الطلاب إلى الحصة...', 'En attente des étudiants...')
                            : t('Waiting for teacher to join...', 'بانتظار انضمام الأستاذ إلى الحصة...', 'En attente du professeur...')}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {t(
                            'Your camera, microphone, and interactive whiteboard are ready. Audio and video connect automatically once another participant enters.',
                            'الكاميرا والميكروفون والسبورة التفاعلية جاهزة. سيتم الربط الصوتي والمرئي تلقائياً بمجرد دخول الطرف الآخر.'
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('zoom-tool');
                            if (isTutor) controllerRef.current?.broadcastActiveMode('whiteboard');
                          }}
                          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <PenTool className="w-4 h-4" />
                          <span>{t('Open Whiteboard', 'فتح السبورة التفاعلية', 'Ouvrir le tableau')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={copyRoomCode}
                          className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition-all"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>{t('Copy Invite Link', 'نسخ رابط الغرفة', 'Copier le lien')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Synced Whiteboard Mode with Clean PiP Video Strip */
            <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 relative">
              <div className="flex-1 min-h-0 h-full">
                <ZoomViewerWidget
                  roomId={roomId}
                  language={language}
                  isEmbedded={true}
                  currentUserId={localUserId}
                  currentUserName={localParticipant.displayName}
                  canDraw={localCanDraw}
                  isTutor={isTutor}
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

              {/* Picture-in-Picture Cameras (compact on phones so infinite whiteboard gets max space) */}
              <div className="flex lg:flex-col gap-2 h-20 sm:h-28 lg:h-full lg:w-60 overflow-x-auto lg:overflow-y-auto flex-shrink-0">
                <div className="w-32 sm:w-44 lg:w-full h-full lg:h-40 flex-shrink-0">
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
                  <div key={remote.userId} className="w-40 sm:w-44 lg:w-full h-full lg:h-40 flex-shrink-0">
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

        {/* Collapsible Side Drawer: Participants & Teacher Permissions OR Live Chat */}
        {sidePanel !== 'none' && (
          <aside className="w-full sm:w-80 md:w-96 bg-white border-l border-slate-200 flex flex-col h-full z-30 absolute sm:relative inset-y-0 right-0 shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSidePanel('participants')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    sidePanel === 'participants'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {t('Participants', 'المشاركون', 'Participants')} ({allParticipants.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanel('chat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    sidePanel === 'chat'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t('Chat', 'الدردشة', 'Chat')}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSidePanel('none')}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label={t('Close panel', 'إغلاق')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sidePanel === 'participants' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isTutor && (
                  <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-blue-800 text-xs font-bold">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span>{t('Teacher Controls', 'أدوات تحكم الأستاذ', 'Contrôles professeur')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          controllerRef.current?.broadcastHostCommand({ type: 'mute-all' })
                        }
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border border-slate-200 shadow-xs transition-all"
                      >
                        <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                        <span>{t('Mute All', 'كتم الجميع', 'Tout couper')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('zoom-tool');
                          controllerRef.current?.broadcastActiveMode('whiteboard');
                        }}
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>{t('Open Board for All', 'فتح السبورة للجميع', 'Ouvrir le tableau')}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {allParticipants.map((p) => {
                    const isStudent = p.role !== 'host';
                    const studentCanDraw = !isStudent || allowedDrawers.includes(p.userId) || Boolean(p.canDraw);

                    return (
                      <div
                        key={p.userId}
                        className="bg-slate-50 border border-slate-200/80 px-3 py-2.5 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                              {p.displayName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {p.displayName}{' '}
                                {p.userId === localUserId ? `(${t('You', 'أنت', 'Vous')})` : ''}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-slate-500">
                                  {p.role === 'host'
                                    ? t('Teacher', 'الأستاذ', 'Professeur')
                                    : t('Student', 'الطالب', 'Étudiant')}
                                </span>
                                {isStudent && studentCanDraw && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                                    <PenTool className="w-2.5 h-2.5" />
                                    {t('Can draw', 'يسمح بالرسم', 'Peut dessiner')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {p.isHandRaised && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isTutor) {
                                    controllerRef.current?.broadcastHostCommand({
                                      type: 'lower-hand',
                                      targetUserId: p.userId
                                    });
                                  }
                                }}
                                className="p-1 bg-amber-100 text-amber-700 rounded-lg border border-amber-200"
                                title={isTutor ? t('Lower Hand', 'إنزال اليد') : ''}
                              >
                                <Hand className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isTutor && p.userId !== localUserId && !p.isMuted && (
                              <button
                                type="button"
                                onClick={() =>
                                  controllerRef.current?.broadcastHostCommand({
                                    type: 'mute-user',
                                    targetUserId: p.userId
                                  })
                                }
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-semibold transition-colors"
                              >
                                {t('Mute', 'كتم', 'Muet')}
                              </button>
                            )}
                            {p.isMuted ? (
                              <MicOff className="w-4 h-4 text-rose-500" />
                            ) : (
                              <Mic className="w-4 h-4 text-emerald-600" />
                            )}
                            {p.isCameraOff ? (
                              <CameraOff className="w-4 h-4 text-slate-400" />
                            ) : (
                              <Camera className="w-4 h-4 text-blue-600" />
                            )}
                          </div>
                        </div>

                        {/* Teacher-only per-student Whiteboard Drawing Permission Toggle */}
                        {isTutor && isStudent && p.userId !== localUserId && (
                          <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                              <PenTool className="w-3.5 h-3.5 text-slate-400" />
                              {t('Allow student to draw', 'السماح للطالب بالرسم', 'Autoriser à dessiner')}
                            </span>
                            <button
                              type="button"
                              disabled={togglingDrawUserId === p.userId}
                              onClick={() => handleToggleStudentDraw(p.userId, studentCanDraw)}
                              role="switch"
                              aria-checked={studentCanDraw}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                                studentCanDraw ? 'bg-blue-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  studentCanDraw ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* In-Room Live Chat */
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs gap-2">
                      <MessageSquare className="w-8 h-8 text-slate-300" />
                      <p>{t('No messages yet. Say hello!', 'لا توجد رسائل بعد. ابدأ المحادثة!', 'Aucun message.')}</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === localUserId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <span className="text-[10px] text-slate-500 mb-0.5 px-1">
                            {msg.senderName} ·{' '}
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div
                            className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-blue-600 text-white rounded-br-sm shadow-xs'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-xs'
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
                  className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={t('Type a message...', 'اكتب رسالة في الغرفة...', 'Écrivez un message...')}
                    className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-900 outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Control Bar (100dvh safe-area, 44px touch targets, never clips on 360-430px) */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-2.5 sm:px-6 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-1.5 overflow-x-auto z-30 shadow-[0_-2px_10px_rgba(15,23,42,0.03)]">
        {/* Left: Audio & Video Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              isMuted
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200/70'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-600" />}
            <span className="hidden md:inline">
              {isMuted ? t('Unmute', 'إلغاء الكتم', 'Activer') : t('Mute', 'كتم الصوت', 'Muet')}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              isCameraOff
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200/70'
            }`}
          >
            {isCameraOff ? (
              <CameraOff className="w-4 h-4" />
            ) : (
              <Camera className="w-4 h-4 text-blue-600" />
            )}
            <span className="hidden md:inline">
              {isCameraOff
                ? t('Start Video', 'تشغيل الكاميرا', 'Activer vidéo')
                : t('Stop Video', 'إيقاف الكاميرا', 'Arrêter vidéo')}
            </span>
          </button>

          <button
            type="button"
            onClick={flipCamera}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200 transition-all flex items-center justify-center"
            title={t('Switch Front/Back Camera', 'تبديل الكاميرا')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Screen Share, Raise Hand, Vector Reactions, Participants, Chat */}
        <div className="flex items-center gap-1.5 sm:gap-2 relative flex-shrink-0">
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              isSharingScreen
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border-slate-200'
            }`}
            title={t('Share Screen or Whiteboard', 'مشاركة الشاشة أو السبورة')}
          >
            {isSharingScreen ? (
              <MonitorOff className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4 text-blue-600" />
            )}
            <span className="hidden sm:inline">
              {isSharingScreen
                ? t('Stop Share', 'إيقاف المشاركة', 'Arrêter')
                : t('Share', 'مشاركة', 'Partager')}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleRaiseHand}
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              isHandRaised
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border-slate-200'
            }`}
            title={t('Raise Hand', 'رفع اليد', 'Lever la main')}
          >
            <Hand className="w-4 h-4" />
            <span className="hidden lg:inline">
              {isHandRaised ? t('Lower Hand', 'إنزال اليد') : t('Raise Hand', 'رفع اليد')}
            </span>
          </button>

          {/* Vector Reactions Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactionsMenu((prev) => !prev)}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200 transition-all flex items-center justify-center"
              title={t('Reactions', 'تفاعلات', 'Réactions')}
            >
              <Smile className="w-4 h-4 text-blue-600" />
            </button>
            {showReactionsMenu && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-2xl px-2.5 py-2 flex items-center gap-1 shadow-xl z-50">
                {REACTION_ITEMS.map(({ id, label, Icon, color }) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    onClick={() => {
                      controllerRef.current?.sendReaction(id);
                      setShowReactionsMenu(false);
                    }}
                    className="w-10 h-10 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setSidePanel((prev) => (prev === 'participants' ? 'none' : 'participants'))
            }
            className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              sidePanel === 'participants'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[11px]">{allParticipants.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setSidePanel((prev) => (prev === 'chat' ? 'none' : 'chat'))}
            className={`relative min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              sidePanel === 'chat'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden md:inline">{t('Chat', 'الدردشة', 'Chat')}</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Leave / End Meeting */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isTutor && (
            <button
              type="button"
              onClick={handleEndRoomForAll}
              className="hidden sm:flex min-h-[44px] items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-xl text-xs transition-all"
              title={t('End session for all participants', 'إنهاء الحصة للجميع')}
            >
              <span>{t('End for All', 'إنهاء للجميع', 'Terminer')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-semibold rounded-xl text-xs transition-all shadow-sm"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">{t('Leave', 'مغادرة', 'Quitter')}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
