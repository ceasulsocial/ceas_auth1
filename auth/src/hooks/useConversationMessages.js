// src/hooks/useConversationMessages.js
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 50;

/**
 * Owns the messages array and the realtime subscription.
 *
 * onInsert, onUpdate, onDelete are the caller's hooks into message
 * lifecycle events. They're stored in refs and updated via useEffect,
 * so the subscription always calls the *current* version — no stale
 * closures, no undefined-callback window on first render.
 */
export function useConversationMessages({
  conversationId,
  onInsert,
  onUpdate,
  onDelete,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const channelRef = useRef(null);

  // Latest-ref pattern: never stale, never undefined.
  const insertRef = useRef(onInsert);
  const updateRef = useRef(onUpdate);
  const deleteRef = useRef(onDelete);

  useEffect(() => {
    insertRef.current = onInsert;
  }, [onInsert]);
  useEffect(() => {
    updateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    deleteRef.current = onDelete;
  }, [onDelete]);

  const fetchInitial = useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;

      setMessages((data || []).slice().reverse());
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Reset + fetch + subscribe whenever the conversation changes.
  useEffect(() => {
    if (!conversationId) return;

    setMessages([]);
    setLoading(true);
    fetchInitial();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel('messages_' + conversationId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, payload.new]
          );
          insertRef.current?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? payload.new : m))
          );
          updateRef.current?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          deleteRef.current?.(payload.old.id);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, fetchInitial]);

  return {
    messages,
    setMessages,
    loading,
    error,
    setError,
    fetchInitial,
    PAGE_SIZE,
  };
}