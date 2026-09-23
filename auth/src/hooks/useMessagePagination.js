// src/hooks/useMessagePagination.js
import { useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Cursor-based "load older messages" with scroll-position preservation.
 *
 * The parent must own hasMoreOlder (so it can decide what happens when
 * the conversation switches). onBeforePrepend/onAfterPrepend let the
 * scroll hook lock its intent around the prepend so media-load events
 * don't yank the user to the bottom while older messages are being
 * inserted above.
 */
export function useMessagePagination({
  conversationId,
  messages,
  setMessages,
  hasMoreOlder,
  setHasMoreOlder,
  messagesListRef,
  onBeforePrepend,
  onAfterPrepend,
  PAGE_SIZE = 50,
}) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlderRef.current || !hasMoreOlder) return;
    if (messages.length === 0) return;

    const listEl = messagesListRef.current;
    if (!listEl) return;
    if (listEl.scrollHeight <= listEl.clientHeight) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const previousScrollHeight = listEl.scrollHeight;
    const previousScrollTop = listEl.scrollTop;
    const oldest = messages[0];

    // Lock scroll intent before mutating the message list.
    onBeforePrepend?.();

    const finish = () => {
      onAfterPrepend?.();
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    };

    try {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation', conversationId)
        .or(
          `created_at.lt.${oldest.created_at},` +
            `and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`
        )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;

      const older = (data || []).slice().reverse();

      if (older.length < PAGE_SIZE) {
        setHasMoreOlder(false);
      }

      if (older.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const filtered = older.filter((m) => !existing.has(m.id));
          return [...filtered, ...prev];
        });

        // Two rAFs: wait for React commit, then for browser layout.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newScrollHeight = listEl.scrollHeight;
            const delta = newScrollHeight - previousScrollHeight;
            listEl.scrollTop = previousScrollTop + delta;
            finish();
          });
        });
      } else {
        finish();
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      finish();
    }
  }, [
    conversationId,
    messages,
    hasMoreOlder,
    setMessages,
    setHasMoreOlder,
    messagesListRef,
    onBeforePrepend,
    onAfterPrepend,
    PAGE_SIZE,
  ]);

  return { loadOlder, loadingOlder };
}