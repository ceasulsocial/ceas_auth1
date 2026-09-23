// src/hooks/useReadReceipts.js
import { useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Marks incoming messages as read for the current user.
 *
 * markingReadRef prevents double-firing on the same message while a
 * request is in flight — otherwise the UPDATE realtime event re-triggers
 * this effect on the same unread IDs forever.
 */
export function useReadReceipts({
  conversationId,
  currentUserId,
  messages,
  myReadColumn,
}) {
  const markingReadRef = useRef(new Set());

  // Reset the in-flight set on conversation change.
  useEffect(() => {
    markingReadRef.current = new Set();
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;

    const unreadIds = messages
      .filter(
        (m) =>
          m.sender_id !== currentUserId &&
          !m[myReadColumn] &&
          !markingReadRef.current.has(m.id)
      )
      .map((m) => m.id);

    if (unreadIds.length === 0) return;

    unreadIds.forEach((id) => markingReadRef.current.add(id));

    supabase
      .from('messages')
      .update({ [myReadColumn]: true })
      .in('id', unreadIds)
      .then(({ error }) => {
        if (error) {
          console.error('Error marking messages read:', error);
          unreadIds.forEach((id) => markingReadRef.current.delete(id));
        }
      });
  }, [messages, conversationId, currentUserId, myReadColumn]);
}