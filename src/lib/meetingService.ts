import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ensureLiveRoomRemote } from './api';

export type MeetingHistoryRecord = {
  id: string;
  sessionId: string;
  tutorId: string;
  studentId: string;
  joinedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: 'active' | 'completed' | 'cancelled';
};

export type WhiteboardStrokePoint = {
  x: number;
  y: number;
};

export type WhiteboardStrokePayload = {
  id: string;
  mode: 'draw' | 'erase';
  color: string;
  width: number;
  points: WhiteboardStrokePoint[];
  senderId: string;
};

export type WhiteboardObjectPayload = {
  id: string;
  kind: 'image' | 'text';
  storagePath?: string | null;
  signedUrl?: string | null;
  textContent?: string | null;
  color?: string;
  fontSize?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  senderId: string;
};

export type WhiteboardSyncEvent =
  | { type: 'stroke'; stroke: WhiteboardStrokePayload }
  | { type: 'undo'; strokeId: string; senderId: string }
  | { type: 'redo'; strokeId: string; senderId: string }
  | { type: 'clear'; senderId: string }
  | { type: 'sync-history'; strokes: WhiteboardStrokePayload[] }
  | { type: 'sync-objects'; objects: WhiteboardObjectPayload[] }
  | { type: 'object-upsert'; object: WhiteboardObjectPayload; ephemeral?: boolean }
  | { type: 'object-delete'; objectId: string; senderId: string }
  | { type: 'permission'; targetUserId: string; canDraw: boolean; senderId: string }
  | { type: 'material'; materialId: string; customImageUrl?: string; senderId: string }
  | { type: 'viewport'; scale: number; position: { x: number; y: number }; senderId: string }
  | { type: 'laser'; x: number; y: number; visible: boolean; senderName: string; senderId: string };

/**
 * Generates a short-lived signed URL for a private whiteboard-media image.
 */
export async function getWhiteboardMediaSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from('whiteboard-media')
      .createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (_) {
    return null;
  }
}

/**
 * Compresses and resizes an image client-side (max 1600px, JPEG 0.82)
 * and uploads it to the private `whiteboard-media` bucket under `<roomId>/<uuid>.jpg`.
 */
export async function compressAndUploadWhiteboardImage(
  roomId: string,
  file: File
): Promise<{ storagePath: string; signedUrl: string; width: number; height: number } | { error: string }> {
  try {
    const imgUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file'));
      el.src = imgUrl;
    });
    URL.revokeObjectURL(imgUrl);

    const MAX_DIM = 1600;
    let targetW = img.naturalWidth || 800;
    let targetH = img.naturalHeight || 600;
    if (targetW > MAX_DIM || targetH > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / targetW, MAX_DIM / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'Canvas unavailable' };
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    );
    if (!blob) return { error: 'Failed to compress image' };

    const uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${roomId}/${uid}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('whiteboard-media')
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadErr) {
      return { error: uploadErr.message };
    }

    const signedUrl = await getWhiteboardMediaSignedUrl(storagePath);
    if (!signedUrl) {
      return { error: 'Uploaded image could not be signed for viewing' };
    }

    return { storagePath, signedUrl, width: targetW, height: targetH };
  } catch (err: any) {
    return { error: err?.message || 'Image upload failed' };
  }
}

export type RoomParticipantState = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'host' | 'student';
  canDraw?: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isHandRaised: boolean;
  isSharingScreen: boolean;
  isOnline: boolean;
  joinedAt: string;
};

export type RoomChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: 'host' | 'student';
  content: string;
  kind: 'text' | 'system' | 'reaction' | 'file';
  createdAt: string;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

/**
 * Generates a clean, deterministic room identifier seeded by the session/room ID.
 */
export function generateSecureRoomName(roomId: string): string {
  const cleanId = roomId.replace(/[^a-zA-Z0-9-]/g, '');
  return `teachme-classroom-${cleanId || 'live-session'}`;
}

/**
 * Legacy helper retained for backward compatibility.
 */
export function buildJitsiOptions({
  roomId,
  userName,
  userAvatar,
  isTutor: _isTutor,
  container,
  language
}: {
  roomId: string;
  userName: string;
  userAvatar?: string;
  isTutor: boolean;
  container: HTMLElement;
  language: 'en' | 'ar' | 'fr';
}) {
  const roomName = generateSecureRoomName(roomId);
  return {
    roomName,
    width: '100%',
    height: '100%',
    parentNode: container,
    userInfo: {
      displayName: userName,
      avatarURL: userAvatar || undefined
    },
    configOverwrite: {
      defaultLanguage: language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : 'en'
    }
  };
}

/**
 * Persists a meeting session start event into Supabase database.
 */
export async function logMeetingStart(sessionId: string, userId: string, role: 'tutor' | 'student'): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('meeting_history')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: role,
        joined_at: new Date().toISOString(),
        status: 'active'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('Notice logging meeting start to database:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('Exception logging meeting start:', err);
    return null;
  }
}

/**
 * Updates a meeting history record upon session leave/end with duration.
 */
export async function logMeetingEnd(historyId: string | null, startTimeMs: number): Promise<void> {
  if (!historyId) return;

  try {
    const nowMs = Date.now();
    const durationSeconds = Math.max(1, Math.round((nowMs - startTimeMs) / 1000));

    const { error } = await supabase
      .from('meeting_history')
      .update({
        ended_at: new Date(nowMs).toISOString(),
        duration_seconds: durationSeconds,
        status: 'completed'
      })
      .eq('id', historyId);

    if (error) {
      console.warn('Notice updating meeting end log:', error.message);
    }
  } catch (err) {
    console.warn('Exception logging meeting end:', err);
  }
}

/**
 * Retrieves meeting history logs for a specific user.
 */
export async function fetchMeetingHistory(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_history')
      .select('*, sessions(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    if (error) {
      console.warn('Notice fetching meeting history:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Exception fetching meeting history:', err);
    return [];
  }
}

/**
 * Checks whether native browser getDisplayMedia is supported in the current runtime.
 * Note: Standard Android System WebView does not implement getDisplayMedia natively,
 * so we seamlessly provide Canvas/Whiteboard stream capture as a fallback on Android.
 */
export function isNativeDisplayMediaSupported(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
      !/wv|Version\/\d+\.\d+.*Chrome\/\d+.*Mobile/i.test(navigator.userAgent)
  );
}

export interface RoomControllerCallbacks {
  onParticipantsChanged: (participants: RoomParticipantState[]) => void;
  onRemoteStreamChanged: (peerId: string, stream: MediaStream | null) => void;
  onChatMessage: (msg: RoomChatMessage) => void;
  onWhiteboardSync: (event: WhiteboardSyncEvent) => void;
  onDrawingPermissionsChanged?: (allowedUserIds: string[]) => void;
  onActiveModeChanged: (mode: 'video' | 'whiteboard' | 'screenshare') => void;
  onHostCommand: (command: { type: 'mute-all' | 'mute-user' | 'lower-hand' | 'end-room'; targetUserId?: string }) => void;
  onReaction: (reaction: { id: string; emoji: string; senderName: string }) => void;
  onConnectionStateChanged: (state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
}

/**
 * Clean-Room WebRTC + Supabase Realtime Room Session Controller.
 * Handles multi-peer WebRTC signaling (SDP Offer/Answer/ICE), Online Presence,
 * In-Room Chat persistence, Host Moderation, and Server-Enforced Realtime Whiteboard synchronization.
 */
export class LiveRoomController {
  private roomId: string;
  private localUser: RoomParticipantState;
  private callbacks: RoomControllerCallbacks;
  private channel: RealtimeChannel | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private participantsMap = new Map<string, RoomParticipantState>();
  private allowedDrawers = new Set<string>();
  private seenStrokeIds = new Set<string>();
  private localStream: MediaStream | null = null;
  private customVideoTrack: MediaStreamTrack | null = null;
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private isDestroyed = false;

  constructor(
    roomId: string,
    localUser: Omit<RoomParticipantState, 'joinedAt' | 'isOnline'>,
    callbacks: RoomControllerCallbacks
  ) {
    this.roomId = generateSecureRoomName(roomId);
    const initialCanDraw = localUser.role === 'host';
    this.localUser = {
      ...localUser,
      canDraw: initialCanDraw,
      isOnline: true,
      joinedAt: new Date().toISOString()
    };
    this.callbacks = callbacks;
    if (initialCanDraw) {
      this.allowedDrawers.add(this.localUser.userId);
    }
    this.participantsMap.set(this.localUser.userId, this.localUser);
  }

  public getRoomChannelName(): string {
    return this.roomId;
  }

  public async connect(initialStream: MediaStream | null): Promise<void> {
    this.localStream = initialStream;
    this.callbacks.onConnectionStateChanged('connecting');

    // 1. Register room & participant in Supabase DB first, then load persisted state
    Promise.resolve(
      ensureLiveRoomRemote(
        this.roomId,
        this.localUser.displayName,
        this.localUser.role,
        this.localUser.avatarUrl
      )
    )
      .catch(() => {})
      .finally(() => {
        if (!this.isDestroyed) {
          this.loadExistingMessages().catch(() => {});
          this.loadInitialWhiteboardState().catch(() => {});
        }
      });

    // 2. Subscribe to Supabase Realtime Channel for Presence + Broadcast Signaling + Server DB Changes
    const channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        presence: { key: this.localUser.userId },
        broadcast: { self: false, ack: false }
      }
    });

    this.channel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        if (this.isDestroyed) return;
        const state = channel.presenceState<RoomParticipantState>();
        const nextMap = new Map<string, RoomParticipantState>();
        nextMap.set(this.localUser.userId, {
          ...this.localUser,
          canDraw: this.isUserAllowedToDraw(this.localUser.userId)
        });

        Object.entries(state).forEach(([peerId, presences]) => {
          if (presences && presences.length > 0) {
            const latest = presences[presences.length - 1];
            if (latest.role === 'host') {
              this.allowedDrawers.add(peerId);
            }
            nextMap.set(peerId, {
              ...latest,
              userId: peerId,
              canDraw: this.isUserAllowedToDraw(peerId),
              isOnline: true
            });
          }
        });

        this.participantsMap = nextMap;
        this.emitParticipants();
        this.emitDrawingPermissions();

        // Initiate WebRTC offer to any newly discovered peers using deterministic tie-breaking
        for (const [peerId] of nextMap.entries()) {
          if (peerId !== this.localUser.userId && !this.peers.has(peerId)) {
            const shouldOffer = this.localUser.userId.localeCompare(peerId) < 0 || this.localUser.role === 'host';
            this.createPeerConnection(peerId, shouldOffer);
          }
        }

        // Clean up disconnected peers
        for (const existingPeerId of Array.from(this.peers.keys())) {
          if (!nextMap.has(existingPeerId)) {
            this.closePeer(existingPeerId);
          }
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (this.isDestroyed || key === this.localUser.userId) return;
        if (newPresences && newPresences.length > 0) {
          const joined = newPresences[newPresences.length - 1] as unknown as RoomParticipantState;
          if (joined.role === 'host') {
            this.allowedDrawers.add(key);
          }
          this.participantsMap.set(key, {
            ...joined,
            userId: key,
            canDraw: this.isUserAllowedToDraw(key),
            isOnline: true
          });
          this.emitParticipants();

          // Always greet newly joined peer with an offer if not already connected
          if (!this.peers.has(key)) {
            this.createPeerConnection(key, true);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (this.isDestroyed || key === this.localUser.userId) return;
        this.participantsMap.delete(key);
        this.closePeer(key);
        this.emitParticipants();
      })
      .on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
        if (this.isDestroyed || !payload) return;
        const { from, to, signalType, sdp, candidate } = payload;
        if (to && to !== this.localUser.userId) return;
        await this.handleSignal(from, signalType, sdp, candidate);
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        if (this.isDestroyed || !payload) return;
        this.callbacks.onChatMessage(payload as RoomChatMessage);
      })
      .on('broadcast', { event: 'whiteboard-sync' }, ({ payload }) => {
        if (this.isDestroyed || !payload) return;
        const ev = payload as WhiteboardSyncEvent;

        // Handle teacher permission broadcast immediately
        if (ev.type === 'permission') {
          const sender = this.participantsMap.get(ev.senderId);
          if (sender?.role !== 'host') return;
          this.applyDrawPermissionLocal(ev.targetUserId, ev.canDraw);
          return;
        }

        // Enforce receiver-side authorization on mutating whiteboard events
        if (ev.type === 'stroke') {
          if (!this.isUserAllowedToDraw(ev.stroke.senderId)) return;
          if (this.seenStrokeIds.has(ev.stroke.id)) return;
          this.seenStrokeIds.add(ev.stroke.id);
        } else if (ev.type === 'clear' || ev.type === 'undo' || ev.type === 'redo') {
          if (!this.isUserAllowedToDraw(ev.senderId)) return;
        }

        this.callbacks.onWhiteboardSync(ev);
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${this.roomId}`
        },
        (payload: any) => {
          if (this.isDestroyed) return;
          const row = payload?.new;
          if (!row?.user_id) return;
          const granted = Boolean(row.can_draw) || row.role === 'host';
          this.applyDrawPermissionLocal(row.user_id, granted);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whiteboard_strokes',
          filter: `room_id=eq.${this.roomId}`
        },
        (payload: any) => {
          if (this.isDestroyed) return;
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new;
            if (row.sender_id === this.localUser.userId || this.seenStrokeIds.has(row.id)) return;
            this.seenStrokeIds.add(row.id);
            this.callbacks.onWhiteboardSync({
              type: 'stroke',
              stroke: {
                id: row.id,
                mode: row.mode === 'erase' ? 'erase' : 'draw',
                color: row.color || '#0F172A',
                width: Number(row.width || 3),
                points: Array.isArray(row.points) ? row.points : [],
                senderId: row.sender_id
              }
            });
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const row = payload.new;
            if (row.is_undone) {
              this.callbacks.onWhiteboardSync({
                type: 'undo',
                strokeId: row.id,
                senderId: row.sender_id
              });
            } else {
              this.callbacks.onWhiteboardSync({
                type: 'redo',
                strokeId: row.id,
                senderId: row.sender_id
              });
            }
          } else if (payload.eventType === 'DELETE') {
            this.loadExistingWhiteboardStrokes().catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whiteboard_objects',
          filter: `room_id=eq.${this.roomId}`
        },
        async (payload: any) => {
          if (this.isDestroyed) return;
          if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
            const row = payload.new;
            const signedUrl = row.storage_path ? await getWhiteboardMediaSignedUrl(row.storage_path) : null;
            this.callbacks.onWhiteboardSync({
              type: 'object-upsert',
              object: {
                id: row.id,
                kind: row.kind === 'text' ? 'text' : 'image',
                storagePath: row.storage_path || null,
                signedUrl,
                textContent: row.text_content || '',
                color: row.color || '#0F172A',
                fontSize: Number(row.font_size || 22),
                x: Number(row.x || 0),
                y: Number(row.y || 0),
                width: Number(row.width || 320),
                height: Number(row.height || 240),
                rotation: Number(row.rotation || 0),
                zIndex: Number(row.z_index || 1),
                senderId: row.sender_id
              }
            });
          } else if (payload.eventType === 'DELETE' && payload.old?.id) {
            this.callbacks.onWhiteboardSync({
              type: 'object-delete',
              objectId: payload.old.id,
              senderId: payload.old.sender_id || ''
            });
          }
        }
      )
      .on('broadcast', { event: 'active-mode' }, ({ payload }) => {
        if (this.isDestroyed || !payload?.mode) return;
        this.callbacks.onActiveModeChanged(payload.mode);
      })
      .on('broadcast', { event: 'host-command' }, ({ payload }) => {
        if (this.isDestroyed || !payload) return;
        this.callbacks.onHostCommand(payload);
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (this.isDestroyed || !payload) return;
        this.callbacks.onReaction(payload);
      });

    channel.subscribe(async (status) => {
      if (this.isDestroyed) return;
      if (status === 'SUBSCRIBED') {
        this.callbacks.onConnectionStateChanged('connected');
        await channel.track(this.localUser);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.callbacks.onConnectionStateChanged('reconnecting');
      } else if (status === 'CLOSED') {
        this.callbacks.onConnectionStateChanged('disconnected');
      }
    });
  }

  private async loadExistingMessages(): Promise<void> {
    const { data, error } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', this.roomId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error || !data) return;
    for (const row of data) {
      this.callbacks.onChatMessage({
        id: row.id,
        roomId: row.room_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        senderRole: row.sender_role as 'host' | 'student',
        content: row.content,
        kind: row.kind as 'text' | 'system' | 'reaction' | 'file',
        createdAt: row.created_at
      });
    }
  }

  private createPeerConnection(peerId: string, isOfferer: boolean): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) {
      try {
        existing.close();
      } catch (_) {}
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(peerId, pc);

    // Attach local tracks
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => pc.addTrack(track, this.localStream!));

      const videoTrack = this.customVideoTrack || this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        pc.addTrack(videoTrack, this.localStream!);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            from: this.localUser.userId,
            to: peerId,
            signalType: 'candidate',
            candidate: event.candidate.toJSON()
          }
        });
      }
    };

    pc.ontrack = (event) => {
      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = event.streams[0] || new MediaStream();
        this.remoteStreams.set(peerId, remoteStream);
      }
      if (!event.streams[0]) {
        remoteStream.addTrack(event.track);
      }
      this.callbacks.onRemoteStreamChanged(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.callbacks.onRemoteStreamChanged(peerId, null);
      }
    };

    if (isOfferer) {
      pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (this.channel && pc.localDescription) {
            this.channel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: {
                from: this.localUser.userId,
                to: peerId,
                signalType: 'offer',
                sdp: pc.localDescription
              }
            });
          }
        })
        .catch((err) => console.warn('WebRTC createOffer warning:', err));
    }

    return pc;
  }

  private async handleSignal(
    fromPeerId: string,
    signalType: 'offer' | 'answer' | 'candidate',
    sdp?: RTCSessionDescriptionInit,
    candidate?: RTCIceCandidateInit
  ): Promise<void> {
    try {
      let pc = this.peers.get(fromPeerId);
      if (!pc) {
        pc = this.createPeerConnection(fromPeerId, false);
      }

      if (signalType === 'offer' && sdp) {
        if (pc.signalingState !== 'stable') {
          const isPolite = this.localUser.userId.localeCompare(fromPeerId) > 0;
          if (!isPolite) return;
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.flushQueuedCandidates(fromPeerId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.channel && pc.localDescription) {
          this.channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: {
              from: this.localUser.userId,
              to: fromPeerId,
              signalType: 'answer',
              sdp: pc.localDescription
            }
          });
        }
      } else if (signalType === 'answer' && sdp) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await this.flushQueuedCandidates(fromPeerId, pc);
        }
      } else if (signalType === 'candidate' && candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          const queue = this.pendingCandidates.get(fromPeerId) || [];
          queue.push(candidate);
          this.pendingCandidates.set(fromPeerId, queue);
        }
      }
    } catch (err) {
      console.warn('WebRTC signal handling warning:', err);
    }
  }

  private async flushQueuedCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(peerId);
    if (!queue || queue.length === 0) return;
    this.pendingCandidates.delete(peerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    }
  }

  public async replaceOutgoingVideoTrack(newVideoTrack: MediaStreamTrack | null): Promise<void> {
    this.customVideoTrack = newVideoTrack;
    const trackToSend = newVideoTrack || (this.localStream ? this.localStream.getVideoTracks()[0] || null : null);

    for (const [, pc] of this.peers.entries()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        try {
          await sender.replaceTrack(trackToSend);
        } catch (err) {
          console.warn('replaceTrack warning:', err);
        }
      } else if (trackToSend && this.localStream) {
        try {
          pc.addTrack(trackToSend, this.localStream);
        } catch (_) {}
      }
    }
  }

  public async updateLocalState(patch: Partial<Pick<RoomParticipantState, 'isMuted' | 'isCameraOff' | 'isHandRaised' | 'isSharingScreen'>>): Promise<void> {
    this.localUser = {
      ...this.localUser,
      ...patch
    };
    this.participantsMap.set(this.localUser.userId, this.localUser);
    this.emitParticipants();

    if (this.channel) {
      try {
        await this.channel.track(this.localUser);
      } catch (_) {}
    }

    // Update participant state in DB (best effort)
    supabase
      .from('room_participants')
      .update({
        is_muted: this.localUser.isMuted,
        is_camera_off: this.localUser.isCameraOff,
        is_hand_raised: this.localUser.isHandRaised,
        is_sharing_screen: this.localUser.isSharingScreen,
        updated_at: new Date().toISOString()
      })
      .eq('room_id', this.roomId)
      .eq('user_id', this.localUser.userId)
      .then(() => {});
  }

  public async sendChatMessage(content: string, kind: 'text' | 'system' | 'reaction' | 'file' = 'text'): Promise<RoomChatMessage> {
    const message: RoomChatMessage = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`,
      roomId: this.roomId,
      senderId: this.localUser.userId,
      senderName: this.localUser.displayName,
      senderRole: this.localUser.role,
      content,
      kind,
      createdAt: new Date().toISOString()
    };

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: message
      });
    }

    // Persist to Supabase DB (non-blocking)
    supabase
      .from('room_messages')
      .insert({
        id: message.id,
        room_id: this.roomId,
        sender_id: this.localUser.userId,
        sender_name: this.localUser.displayName,
        sender_role: this.localUser.role,
        content: message.content,
        kind: message.kind
      })
      .then(() => {});

    return message;
  }

  public isUserAllowedToDraw(userId: string): boolean {
    if (!userId) return false;
    if (this.allowedDrawers.has(userId)) return true;
    const p = this.participantsMap.get(userId);
    return p?.role === 'host' || Boolean(p?.canDraw);
  }

  private applyDrawPermissionLocal(targetUserId: string, canDraw: boolean): void {
    const existing = this.participantsMap.get(targetUserId);
    const effective = existing?.role === 'host' ? true : Boolean(canDraw);

    if (effective) {
      this.allowedDrawers.add(targetUserId);
    } else {
      this.allowedDrawers.delete(targetUserId);
    }

    if (targetUserId === this.localUser.userId) {
      this.localUser = { ...this.localUser, canDraw: effective };
    }

    if (existing) {
      this.participantsMap.set(targetUserId, { ...existing, canDraw: effective });
    }

    this.emitParticipants();
    this.emitDrawingPermissions();
  }

  private emitDrawingPermissions(): void {
    this.callbacks.onDrawingPermissionsChanged?.(Array.from(this.allowedDrawers));
  }

  private async loadInitialWhiteboardState(): Promise<void> {
    // 1. Hydrate server-side drawing permissions from public.room_participants
    const { data: partRows } = await supabase
      .from('room_participants')
      .select('user_id, role, can_draw')
      .eq('room_id', this.roomId);

    if (partRows && !this.isDestroyed) {
      for (const row of partRows) {
        const allowed = row.role === 'host' || Boolean(row.can_draw);
        if (allowed) {
          this.allowedDrawers.add(row.user_id);
        } else {
          this.allowedDrawers.delete(row.user_id);
        }
        const existing = this.participantsMap.get(row.user_id);
        if (existing) {
          this.participantsMap.set(row.user_id, { ...existing, canDraw: allowed });
        }
        if (row.user_id === this.localUser.userId) {
          this.localUser = { ...this.localUser, canDraw: allowed };
        }
      }
      this.emitParticipants();
      this.emitDrawingPermissions();
    }

    // 2. Hydrate persisted non-undone strokes & objects from Supabase
    await Promise.all([
      this.loadExistingWhiteboardStrokes(),
      this.loadExistingWhiteboardObjects()
    ]);
  }

  private async loadExistingWhiteboardObjects(): Promise<void> {
    const { data: rows, error } = await supabase
      .from('whiteboard_objects')
      .select('id, kind, storage_path, text_content, color, font_size, x, y, width, height, rotation, z_index, sender_id')
      .eq('room_id', this.roomId)
      .order('z_index', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !rows || this.isDestroyed) return;
    const objects: WhiteboardObjectPayload[] = await Promise.all(
      rows.map(async (row: any) => ({
        id: row.id,
        kind: (row.kind === 'text' ? 'text' : 'image') as 'image' | 'text',
        storagePath: row.storage_path || null,
        signedUrl: row.storage_path ? await getWhiteboardMediaSignedUrl(row.storage_path) : null,
        textContent: row.text_content || '',
        color: row.color || '#0F172A',
        fontSize: Number(row.font_size || 22),
        x: Number(row.x || 0),
        y: Number(row.y || 0),
        width: Number(row.width || 320),
        height: Number(row.height || 240),
        rotation: Number(row.rotation || 0),
        zIndex: Number(row.z_index || 1),
        senderId: row.sender_id
      }))
    );
    this.callbacks.onWhiteboardSync({ type: 'sync-objects', objects });
  }

  private async loadExistingWhiteboardStrokes(): Promise<void> {
    const { data: strokeRows, error } = await supabase
      .from('whiteboard_strokes')
      .select('id, mode, color, width, points, sender_id')
      .eq('room_id', this.roomId)
      .eq('is_undone', false)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error || !strokeRows || this.isDestroyed) return;
    const strokes: WhiteboardStrokePayload[] = strokeRows.map((row: any) => {
      this.seenStrokeIds.add(row.id);
      return {
        id: row.id,
        mode: row.mode === 'erase' ? 'erase' : 'draw',
        color: row.color || '#0F172A',
        width: Number(row.width || 3),
        points: Array.isArray(row.points) ? row.points : [],
        senderId: row.sender_id
      };
    });
    this.callbacks.onWhiteboardSync({ type: 'sync-history', strokes });
  }

  public async setStudentDrawPermission(targetUserId: string, canDraw: boolean): Promise<{ ok: boolean; error?: string }> {
    if (this.localUser.role !== 'host') {
      return { ok: false, error: 'forbidden' };
    }

    const { data, error } = await supabase.rpc('set_student_draw_permission', {
      p_room_id: this.roomId,
      p_target_user_id: targetUserId,
      p_can_draw: canDraw
    });

    if (error || (data as any)?.error) {
      return { ok: false, error: error?.message || (data as any)?.error };
    }

    this.applyDrawPermissionLocal(targetUserId, canDraw);

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'whiteboard-sync',
        payload: {
          type: 'permission',
          targetUserId,
          canDraw,
          senderId: this.localUser.userId
        }
      });
    }

    return { ok: true };
  }

  public async broadcastWhiteboardEvent(event: WhiteboardSyncEvent): Promise<boolean> {
    // Reject unauthorized mutating whiteboard actions before persisting or broadcasting
    if (
      event.type === 'stroke' ||
      event.type === 'clear' ||
      event.type === 'undo' ||
      event.type === 'redo' ||
      event.type === 'object-upsert' ||
      event.type === 'object-delete'
    ) {
      if (!this.isUserAllowedToDraw(this.localUser.userId)) {
        return false;
      }

      if (event.type === 'stroke') {
        this.seenStrokeIds.add(event.stroke.id);
        const { error } = await supabase.from('whiteboard_strokes').insert({
          id: event.stroke.id,
          room_id: this.roomId,
          sender_id: this.localUser.userId,
          mode: event.stroke.mode,
          color: event.stroke.color,
          width: event.stroke.width,
          points: event.stroke.points,
          is_undone: false
        });
        if (error) {
          console.warn('Whiteboard stroke rejected by server RLS:', error.message);
          return false;
        }
      } else if (event.type === 'object-upsert' && !event.ephemeral) {
        const obj = event.object;
        const { error } = await supabase.from('whiteboard_objects').upsert(
          {
            id: obj.id,
            room_id: this.roomId,
            sender_id: this.localUser.userId,
            kind: obj.kind,
            storage_path: obj.storagePath || null,
            text_content: obj.textContent || null,
            color: obj.color || '#0F172A',
            font_size: obj.fontSize || 22,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            rotation: obj.rotation || 0,
            z_index: obj.zIndex || 1,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );
        if (error) {
          console.warn('Whiteboard object upsert rejected by server RLS:', error.message);
          return false;
        }
      } else if (event.type === 'object-delete') {
        const { error } = await supabase
          .from('whiteboard_objects')
          .delete()
          .eq('id', event.objectId)
          .eq('room_id', this.roomId);
        if (error) {
          console.warn('Whiteboard object delete rejected by server RLS:', error.message);
          return false;
        }
      } else if (event.type === 'undo') {
        const { error } = await supabase
          .from('whiteboard_strokes')
          .update({ is_undone: true })
          .eq('id', event.strokeId)
          .eq('room_id', this.roomId);
        if (error) {
          console.warn('Whiteboard undo rejected by server RLS:', error.message);
          return false;
        }
      } else if (event.type === 'redo') {
        const { error } = await supabase
          .from('whiteboard_strokes')
          .update({ is_undone: false })
          .eq('id', event.strokeId)
          .eq('room_id', this.roomId);
        if (error) {
          console.warn('Whiteboard redo rejected by server RLS:', error.message);
          return false;
        }
      } else if (event.type === 'clear') {
        const [{ error }, { error: objErr }] = await Promise.all([
          supabase.from('whiteboard_strokes').delete().eq('room_id', this.roomId),
          supabase.from('whiteboard_objects').delete().eq('room_id', this.roomId)
        ]);
        if (error || objErr) {
          console.warn('Whiteboard clear rejected by server RLS:', error?.message || objErr?.message);
          return false;
        }
        this.seenStrokeIds.clear();
      }
    }

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'whiteboard-sync',
        payload: event
      });
    }
    return true;
  }

  public broadcastActiveMode(mode: 'video' | 'whiteboard' | 'screenshare'): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'active-mode',
      payload: { mode }
    });

    supabase
      .from('rooms')
      .update({ active_mode: mode, updated_at: new Date().toISOString() })
      .eq('id', this.roomId)
      .then(() => {});
  }

  public broadcastHostCommand(command: { type: 'mute-all' | 'mute-user' | 'lower-hand' | 'end-room'; targetUserId?: string }): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'host-command',
      payload: command
    });
  }

  public sendReaction(emoji: string): void {
    if (!this.channel) return;
    const reaction = {
      id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emoji,
      senderName: this.localUser.displayName
    };
    this.channel.send({
      type: 'broadcast',
      event: 'reaction',
      payload: reaction
    });
    this.callbacks.onReaction(reaction);
  }

  private closePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      this.peers.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.callbacks.onRemoteStreamChanged(peerId, null);
  }

  private emitParticipants(): void {
    const list = Array.from(this.participantsMap.values()).sort((a, b) => {
      if (a.role === 'host' && b.role !== 'host') return -1;
      if (b.role === 'host' && a.role !== 'host') return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    this.callbacks.onParticipantsChanged(list);
  }

  public async disconnect(): Promise<void> {
    this.isDestroyed = true;
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }

    if (this.channel) {
      try {
        await this.channel.untrack();
        await supabase.removeChannel(this.channel);
      } catch (_) {}
      this.channel = null;
    }

    supabase
      .from('room_participants')
      .update({
        is_online: false,
        left_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('room_id', this.roomId)
      .eq('user_id', this.localUser.userId)
      .then(() => {});
  }
}
