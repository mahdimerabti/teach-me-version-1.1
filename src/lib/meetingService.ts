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

export type WhiteboardSyncEvent =
  | { type: 'stroke'; stroke: WhiteboardStrokePayload }
  | { type: 'clear'; senderId: string }
  | { type: 'material'; materialId: string; customImageUrl?: string; senderId: string }
  | { type: 'viewport'; scale: number; position: { x: number; y: number }; senderId: string }
  | { type: 'laser'; x: number; y: number; visible: boolean; senderName: string; senderId: string };

export type RoomParticipantState = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'host' | 'student';
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
  onActiveModeChanged: (mode: 'video' | 'whiteboard' | 'screenshare') => void;
  onHostCommand: (command: { type: 'mute-all' | 'mute-user' | 'lower-hand' | 'end-room'; targetUserId?: string }) => void;
  onReaction: (reaction: { id: string; emoji: string; senderName: string }) => void;
  onConnectionStateChanged: (state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
}

/**
 * Clean-Room WebRTC + Supabase Realtime Room Session Controller.
 * Handles multi-peer WebRTC signaling (SDP Offer/Answer/ICE), Online Presence,
 * In-Room Chat persistence, Host Moderation, and Realtime Whiteboard synchronization.
 */
export class LiveRoomController {
  private roomId: string;
  private localUser: RoomParticipantState;
  private callbacks: RoomControllerCallbacks;
  private channel: RealtimeChannel | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private participantsMap = new Map<string, RoomParticipantState>();
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
    this.localUser = {
      ...localUser,
      isOnline: true,
      joinedAt: new Date().toISOString()
    };
    this.callbacks = callbacks;
    this.participantsMap.set(this.localUser.userId, this.localUser);
  }

  public getRoomChannelName(): string {
    return this.roomId;
  }

  public async connect(initialStream: MediaStream | null): Promise<void> {
    this.localStream = initialStream;
    this.callbacks.onConnectionStateChanged('connecting');

    // 1. Register room & participant in Supabase DB (non-blocking fallback for guest/demo users)
    Promise.resolve(
      ensureLiveRoomRemote(
        this.roomId,
        this.localUser.displayName,
        this.localUser.role,
        this.localUser.avatarUrl
      )
    ).catch(() => {});

    // 2. Load recent chat messages from public.room_messages
    this.loadExistingMessages().catch(() => {});

    // 3. Subscribe to Supabase Realtime Channel for Presence + Broadcast Signaling + Chat
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
        nextMap.set(this.localUser.userId, this.localUser);

        Object.entries(state).forEach(([peerId, presences]) => {
          if (presences && presences.length > 0) {
            const latest = presences[presences.length - 1];
            nextMap.set(peerId, {
              ...latest,
              userId: peerId,
              isOnline: true
            });
          }
        });

        this.participantsMap = nextMap;
        this.emitParticipants();

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
          this.participantsMap.set(key, { ...joined, userId: key, isOnline: true });
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
        this.callbacks.onWhiteboardSync(payload as WhiteboardSyncEvent);
      })
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

  public broadcastWhiteboardEvent(event: WhiteboardSyncEvent): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'whiteboard-sync',
      payload: event
    });
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
