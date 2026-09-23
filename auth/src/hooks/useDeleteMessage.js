// src/hooks/useDeleteMessage.js
import { useCallback } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Soft-delete a message. Optimistically updates the local list and
 * reverts on failure.
 */
export function useDeleteMessage({
  conversationId,
  currentUserId,
  setMessages,
  setError,
}) {
  const deleteMessage = useCallback(
    async (message) => {
      if (!message || !conversationId) return;
      if (message.sender_id !== currentUserId) return;

      const deletedAt = new Date().toISOString();

      // Optimistic
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, deleted_at: deletedAt, deleted_by: currentUserId }
            : m
        )
      );

      const { error: deleteError } = await supabase
        .from('messages')
        .update({ deleted_at: deletedAt, deleted_by: currentUserId })
        .eq('id', message.id);

      if (deleteError) {
        console.error('Error deleting message:', deleteError);
        setError(`Failed to delete message: ${deleteError.message}`);
        // Revert
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, deleted_at: null, deleted_by: null }
              : m
          )
        );
      }
    },
    [conversationId, currentUserId, setMessages, setError]
  );

  return { deleteMessage };
}