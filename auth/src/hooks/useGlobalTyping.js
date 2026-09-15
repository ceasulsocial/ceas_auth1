// src/hooks/useGlobalTyping.js
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const TYPING_SEND_THROTTLE_MS = 3000;
const TYPING_STOP_TIMEOUT_MS = 5000;

/**
 * Global typing indicator shared across all conversations.
 *
 * - One Realtime channel per user session ("typing:global").
 * - Broadcasts carry { conversationId, userId }.
 * - Auto-clears each conversation's typing state 5s after the last event.
 * - Unaffected by which conversation is currently open.
 */
export function useGlobalTyping(currentUserId) {
  const [typingConversations, setTypingConversations] = useState({});
  const channelRef = useRef(null);
  const clearTimersRef = useRef({});
  const lastSentRef = useRef({});

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel('typing:global', {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { conversationId, userId: senderId } = payload || {};
      if (!conversationId) return;
      if (senderId === currentUserId) return; // ignore our own echo

      setTypingConversations((prev) =>
        prev[conversationId] ? prev : { ...prev, [conversationId]: true }
      );

      if (clearTimersRef.current[conversationId]) {
        clearTimeout(clearTimersRef.current[conversationId]);
      }
      clearTimersRef.current[conversationId] = setTimeout(() => {
        setTypingConversations((prev) => {
          if (!prev[conversationId]) return prev;
          const { [conversationId]: _, ...rest } = prev;
          return rest;
        });
        delete clearTimersRef.current[conversationId];
      }, TYPING_STOP_TIMEOUT_MS);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      Object.values(clearTimersRef.current).forEach(clearTimeout);
      clearTimersRef.current = {};

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUserId]);

  const notifyTyping = useCallback(
    (conversationId) => {
      if (!conversationId || !channelRef.current) return;
      const now = Date.now();
      const last = lastSentRef.current[conversationId] || 0;
      if (now - last < TYPING_SEND_THROTTLE_MS) return;
      lastSentRef.current[conversationId] = now;

      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversationId,
          userId: currentUserId,
        },
      });
    },
    [currentUserId]
  );

  const clearTypingFor = useCallback((conversationId) => {
    if (!conversationId) return;
    if (clearTimersRef.current[conversationId]) {
      clearTimeout(clearTimersRef.current[conversationId]);
      delete clearTimersRef.current[conversationId];
    }
    setTypingConversations((prev) => {
      if (!prev[conversationId]) return prev;
      const { [conversationId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return { typingConversations, notifyTyping, clearTypingFor };
}