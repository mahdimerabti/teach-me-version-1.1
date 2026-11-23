import { supabase } from './supabase';

export type DBMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  is_read: boolean;
  created_at: string;
};

export type DBConversation = {
  id: string;
  student_id: string;
  tutor_id: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
  participantName?: string;
  participantAvatar?: string;
  unreadCount?: number;
};

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Gets or creates a conversation record between a student and a tutor.
 */
export async function getOrCreateConversation(studentId: string, tutorUserIdOrId: string): Promise<string | null> {
  if (!studentId || !tutorUserIdOrId) return null;

  try {
    let realTutorUserId = tutorUserIdOrId;
    const { data: tData } = await supabase
      .from('tutors')
      .select('user_id')
      .eq('id', tutorUserIdOrId)
      .maybeSingle();
    if (tData?.user_id) {
      realTutorUserId = tData.user_id;
    }

    // 1. Check if conversation already exists between studentId and realTutorUserId
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(student_id.eq.${studentId},tutor_id.eq.${realTutorUserId}),and(student_id.eq.${realTutorUserId},tutor_id.eq.${studentId})`
      )
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return existing.id;
    }

    // 2. Insert new conversation
    const newId = generateUUID();
    const { data: created, error: createError } = await supabase
      .from('conversations')
      .insert({
        id: newId,
        student_id: studentId,
        tutor_id: realTutorUserId,
        last_message: '',
        last_message_at: new Date().toISOString()
      })
      .select('id')
      .maybeSingle();

    if (createError) {
      // Handle race condition where conversation was created simultaneously
      const { data: retryExisting } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(student_id.eq.${studentId},tutor_id.eq.${realTutorUserId}),and(student_id.eq.${realTutorUserId},tutor_id.eq.${studentId})`
        )
        .limit(1)
        .maybeSingle();
      if (retryExisting?.id) return retryExisting.id;
      console.warn('Notice creating conversation in DB:', createError.message);
      return null;
    }

    return created?.id || newId;
  } catch (err) {
    console.warn('Exception in getOrCreateConversation:', err);
    return null;
  }
}

/**
 * Fetches all conversations for the active user with metadata and unread count.
 */
export async function fetchUserConversations(userId: string, isTutor: boolean): Promise<DBConversation[]> {
  if (!userId) return [];

  try {
    const filterField = isTutor ? 'tutor_id' : 'student_id';
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('*')
      .eq(filterField, userId)
      .order('last_message_at', { ascending: false });

    if (error || !convs) {
      console.warn('Notice fetching user conversations:', error?.message);
      return [];
    }

    // Batch-fetch participant names/avatars safely via SECURITY DEFINER RPC
    const otherIds = Array.from(
      new Set(convs.map((c) => (isTutor ? c.student_id : c.tutor_id)).filter(Boolean))
    );
    const profileMap: Record<string, { full_name?: string; avatar_url?: string }> = {};
    if (otherIds.length > 0) {
      try {
        const { data: partProfs } = await supabase.rpc('get_participant_profiles', {
          p_user_ids: otherIds
        });
        if (Array.isArray(partProfs)) {
          partProfs.forEach((p: any) => {
            if (p?.user_id) profileMap[p.user_id] = p;
          });
        }
      } catch (_) {}
    }

    // Fetch unread message count for each conversation
    const enriched = await Promise.all(
      convs.map(async (conv) => {
        const otherUserId = isTutor ? conv.student_id : conv.tutor_id;
        const prof = profileMap[otherUserId];
        const pName = prof?.full_name || (isTutor ? 'Student' : 'Tutor');
        const pAvatar = prof?.avatar_url || '';

        // Fetch unread count
        let unread = 0;
        try {
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('receiver_id', userId)
            .eq('is_read', false);

          unread = count || 0;
        } catch (_) {}

        return {
          ...conv,
          participantName: pName,
          participantAvatar: pAvatar,
          unreadCount: unread
        };
      })
    );

    return enriched;
  } catch (err) {
    console.warn('Exception in fetchUserConversations:', err);
    return [];
  }
}

/**
 * Fetches all messages in a conversation thread.
 */
export async function fetchMessages(conversationId: string): Promise<DBMessage[]> {
  if (!conversationId) return [];

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Notice fetching messages from DB:', error.message);
      // Retrieve cached local messages if DB fetch fails
      const cached = localStorage.getItem(`tm_messages_${conversationId}`);
      return cached ? JSON.parse(cached) : [];
    }
    if (data) {
      localStorage.setItem(`tm_messages_${conversationId}`, JSON.stringify(data));
    }
    return data || [];
  } catch (err) {
    console.warn('Exception in fetchMessages:', err);
    const cached = localStorage.getItem(`tm_messages_${conversationId}`);
    return cached ? JSON.parse(cached) : [];
  }
}

/**
 * Sends a real message, stores it in database, and updates conversation metadata.
 */
export async function sendChatMessage({
  conversationId,
  senderId,
  receiverId,
  content
}: {
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
}): Promise<DBMessage> {
  const now = new Date().toISOString();
  const fallbackMsg: DBMessage = {
    id: generateUUID(),
    conversation_id: conversationId,
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    status: 'sent',
    is_read: false,
    created_at: now
  };

  if (!content.trim()) return fallbackMsg;

  try {
    // 1. Insert message record
    const { data, error } = await supabase
      .from('messages')
      .insert({
        id: fallbackMsg.id,
        conversation_id: conversationId,
        sender_id: senderId,
        receiver_id: receiverId,
        content: content.trim(),
        status: 'sent',
        is_read: false,
        created_at: now
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Notice inserting message to DB (using local message object):', error.message);
    }

    // Update local cache
    try {
      const existingKey = `tm_messages_${conversationId}`;
      const existing: DBMessage[] = JSON.parse(localStorage.getItem(existingKey) || '[]');
      const updated = [...existing, data || fallbackMsg];
      localStorage.setItem(existingKey, JSON.stringify(updated));
    } catch (_) {}

    // 2. Update conversation last message snippet & timestamp
    try {
      await supabase
        .from('conversations')
        .update({
          last_message: content.trim(),
          last_message_at: now
        })
        .eq('id', conversationId);
    } catch (_) {}

    return data || fallbackMsg;
  } catch (err) {
    console.warn('Exception sending message:', err);
    return fallbackMsg;
  }
}

/**
 * Marks all incoming unread messages in a conversation thread as read.
 */
export async function markMessagesAsRead(conversationId: string, currentUserId: string): Promise<void> {
  if (!conversationId || !currentUserId) return;

  try {
    await supabase
      .from('messages')
      .update({
        is_read: true,
        status: 'read'
      })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', currentUserId)
      .eq('is_read', false);
  } catch (err) {
    console.warn('Exception in markMessagesAsRead:', err);
  }
}

/**
 * Subscribes to Supabase Realtime channel for new messages in a conversation.
 */
export function subscribeToConversationMessages(
  conversationId: string,
  onMessageReceived: (message: DBMessage) => void
) {
  const channel = supabase
    .channel(`chat-room-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        if (payload.new) {
          onMessageReceived(payload.new as DBMessage);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to Supabase Realtime channel for incoming messages to a user.
 */
export function subscribeToUserInbox(
  userId: string,
  onInboxUpdate: () => void
) {
  const channel = supabase
    .channel(`user-inbox-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`
      },
      () => {
        onInboxUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
