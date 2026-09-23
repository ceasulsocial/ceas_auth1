// src/hooks/useUnreadReset.js
import { useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Keeps the currently-open conversation's unread count at 0.
 *
 * Depends on `messages` so a message arriving live while viewing the
 * conversation still triggers a reset (otherwise the DB trigger would
 * bump the count and nothing would clear it).
 */
export function useUnreadReset({
  conversationId,
  currentUnread,
  myUnreadColumn,
  messages,
}) {
  useEffect(() => {
    if (!conversationId || currentUnread === 0) return;

    supabase
      .from('conversations')
      .update({ [myUnreadColumn]: 0 })
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('Error resetting unread count:', error);
      });
  }, [conversationId, currentUnread, myUnreadColumn, messages]);
}