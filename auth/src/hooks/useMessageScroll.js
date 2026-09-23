// src/hooks/useMessageScroll.js
import { useState, useRef, useCallback, useEffect } from 'react';

// Single source of truth — import this everywhere else.
export const SCROLL_BUTTON_THRESHOLD = 300;

/**
 * All scroll-related state for a conversation view.
 *
 * Scroll intent is a ref, not state, because loadOlder sets it
 * synchronously before mutating the message list, and we need the
 * "don't auto-scroll" decision to happen in the same tick.
 *
 * beginPrepend/endPrepend are exposed so pagination can lock the intent
 * without knowing the ref exists.
 */
export function useMessageScroll({
  messages,
  conversationId,
  messagesListRef,
  messagesEndRef,
  loadOlder,
  currentUserId,
}) {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState(0);
  const [newMessageDividerId, setNewMessageDividerId] = useState(null);

  const scrollTimerRef = useRef(null);
  const scrollIntentRef = useRef('none'); // 'none' | 'preserve'
  const hasDoneInitialScrollRef = useRef(false);
  const prependTimeoutRef = useRef(null);

  // ── Core scroll-to-bottom (debounced + double-rAF) ──
  const scheduleScroll = useCallback(
    (force = false) => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollIntentRef.current === 'preserve') return;
            if (!force) {
              const listEl = messagesListRef.current;
              if (listEl) {
                const d =
                  listEl.scrollHeight -
                  listEl.scrollTop -
                  listEl.clientHeight;
                if (d > 200) return;
              }
            }
            messagesEndRef.current?.scrollIntoView({
              behavior: 'instant',
            });
          });
        });
      }, 50);
    },
    [messagesListRef, messagesEndRef]
  );

  // ── Media-load rescroll (only if near bottom) ──
  const handleMediaLoad = useCallback(() => {
    if (scrollIntentRef.current === 'preserve') return;
    const listEl = messagesListRef.current;
    if (!listEl) return;
    const d =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (d > 500) return;
    scheduleScroll();
  }, [scheduleScroll, messagesListRef]);

  // ── Scroll listener ──
  const handleScroll = useCallback(() => {
    const listEl = messagesListRef.current;
    if (!listEl) return;
    if (scrollIntentRef.current === 'preserve') return;

    if (listEl.scrollTop < 200) loadOlder();

    const d =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    const isFar = d > SCROLL_BUTTON_THRESHOLD;
    setShowScrollButton(isFar);

    if (!isFar) {
      setUnreadWhileScrolledUp(0);
      setNewMessageDividerId((prev) => (prev ? null : prev));
    }
  }, [loadOlder, messagesListRef]);

  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    setNewMessageDividerId(null);
  }, [messagesEndRef]);

  // ── Notify the hook that a new message arrived ──
  // Called from the composer's onInsert callback. Also used by
  // onMessageSent for the sender's own message.
  const handleIncoming = useCallback(
    (msg) => {
      // Reset intent — a real message arrived, not a prepend.
      scrollIntentRef.current = 'none';

      const listEl = messagesListRef.current;
      const d = listEl
        ? listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight
        : null;
      const isNearBottom =
        d !== null ? d < SCROLL_BUTTON_THRESHOLD : true;

      if (!isNearBottom && msg.sender_id !== currentUserId) {
        setUnreadWhileScrolledUp((n) => n + 1);
        setNewMessageDividerId((prev) => prev ?? msg.id);
      }
    },
    [messagesListRef, currentUserId]
  );

  // ── Notify the hook that the user sent their own message ──
  const handleOwnSend = useCallback(() => {
    scrollIntentRef.current = 'none';
    hasDoneInitialScrollRef.current = true;
    scheduleScroll(true);
  }, [scheduleScroll]);

  // ── Prepend lock (called by pagination) ──
  const beginPrepend = useCallback(() => {
    if (prependTimeoutRef.current) {
      clearTimeout(prependTimeoutRef.current);
      prependTimeoutRef.current = null;
    }
    scrollIntentRef.current = 'preserve';
  }, []);

  const endPrepend = useCallback(() => {
    // Keep 'preserve' active briefly so late media-load events from
    // the newly-prepended block don't trigger a scroll-to-bottom.
    if (prependTimeoutRef.current) clearTimeout(prependTimeoutRef.current);
    prependTimeoutRef.current = setTimeout(() => {
      if (scrollIntentRef.current === 'preserve') {
        scrollIntentRef.current = 'none';
      }
      prependTimeoutRef.current = null;
    }, 500);
  }, []);

  // ── Reset on conversation change ──
  useEffect(() => {
    scrollIntentRef.current = 'none';
    hasDoneInitialScrollRef.current = false;
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    setNewMessageDividerId(null);

    if (prependTimeoutRef.current) {
      clearTimeout(prependTimeoutRef.current);
      prependTimeoutRef.current = null;
    }
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
  }, [conversationId]);

  // ── Unified auto-scroll effect ──
  useEffect(() => {
    if (messages.length === 0) return;
    const listEl = messagesListRef.current;
    if (!listEl) return;
    if (scrollIntentRef.current === 'preserve') return;

    if (!hasDoneInitialScrollRef.current) {
      hasDoneInitialScrollRef.current = true;
      scheduleScroll(true);
      return;
    }

    const d =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (d < 200) scheduleScroll();
  }, [messages, scheduleScroll, messagesListRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (prependTimeoutRef.current)
        clearTimeout(prependTimeoutRef.current);
    };
  }, []);

  return {
    showScrollButton,
    unreadWhileScrolledUp,
    newMessageDividerId,
    scheduleScroll,
    handleMediaLoad,
    handleScroll,
    handleScrollToBottom,
    handleIncoming,
    handleOwnSend,
    beginPrepend,
    endPrepend,
  };
}