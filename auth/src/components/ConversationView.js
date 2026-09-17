import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import { useMessageSender } from '../hooks/useMessageSender';
import './ConversationsList.css';

const PAGE_SIZE = 50;
const SCROLL_BUTTON_THRESHOLD = 300;

export default function ConversationView({
  conversation,
  currentUserId,
  onMessageSent: onMessageSentProp,
  notifyTyping,
  clearTypingFor,
  isOtherTyping,
}) {
  // Primitive values — safe for effect deps
  const conversationId = conversation?.id;
  const user1Id = conversation?.user1_id;
  const isUser1 = currentUserId === user1Id;
  const myUnreadColumn = isUser1 ? 'unread_count_user1' : 'unread_count_user2';
  const myReadColumn = isUser1 ? 'read_user1' : 'read_user2';
  const currentUnread = conversation?.[myUnreadColumn] || 0;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [error, setError] = useState(null);

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState(0);

  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const markingReadRef = useRef(new Set());
  const channelRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const scrollIntentRef = useRef('none'); // 'none' | 'preserve'
  const hasDoneInitialScrollRef = useRef(false);

  // ── scheduleScroll ──
  // Only scrolls if we're allowed to. `force = true` bypasses the
  // near-bottom check (used for initial load and own sends).
  const scheduleScroll = useCallback((force = false) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Guard 1: mid-prepend
          if (scrollIntentRef.current === 'preserve') return;

          // Guard 2: user is reading history (unless forced)
          if (!force) {
            const listEl = messagesListRef.current;
            if (listEl) {
              const distanceFromBottom =
                listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
              if (distanceFromBottom > 200) return;
            }
          }

          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        });
      });
    }, 50);
  }, []);

  // ── Media load handler ──
  // Videos/audio fire onLoadedMetadata asynchronously. During a prepend,
  // or when the user is scrolled up, we don't want those events to yank
  // the user to the bottom.
  const handleMediaLoad = useCallback(() => {
    // Guard: mid-prepend
    if (scrollIntentRef.current === 'preserve') return;

    const listEl = messagesListRef.current;
    if (!listEl) return;

    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;

    // Only attempt scroll if user is well inside the bottom zone
    if (distanceFromBottom > 500) return;

    scheduleScroll();
  }, [scheduleScroll]);

  // ── Send hook ──
  const {
    send,
    cancel,
    uploading,
    error: sendError,
    progress,
  } = useMessageSender({
    conversationId,
    currentUserId,
    onMessageSent: (msg) => {
      // Reset prepend intent — a real new message is happening now
      scrollIntentRef.current = 'none';
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      onMessageSentProp?.(msg);
      hasDoneInitialScrollRef.current = true;
      scheduleScroll(true);
    },
  });

  // ── Delete handler ──
  const handleDeleteMessage = useCallback(
    async (message) => {
      if (!message || !conversationId) return;
      if (message.sender_id !== currentUserId) return;

      const deletedAt = new Date().toISOString();

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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, deleted_at: null, deleted_by: null }
              : m
          )
        );
      }
    },
    [conversationId, currentUserId]
  );

  // ── Typing forwarding ──
  const sendTyping = useCallback(() => {
    if (notifyTyping && conversationId) {
      notifyTyping(conversationId);
    }
  }, [notifyTyping, conversationId]);

  // ── Initial fetch ──
  const fetchInitialMessages = useCallback(async () => {
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

      const sorted = (data || []).slice().reverse();
      setMessages(sorted);
      setHasMoreOlder((data?.length || 0) === PAGE_SIZE);
      hasDoneInitialScrollRef.current = false;
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // ── Load older ──
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

    const finishLoadingOlder = () => {
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
        scrollIntentRef.current = 'preserve';

        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const filtered = older.filter((m) => !existing.has(m.id));
          return [...filtered, ...prev];
        });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (listEl) {
              const newScrollHeight = listEl.scrollHeight;
              const delta = newScrollHeight - previousScrollHeight;
              listEl.scrollTop = previousScrollTop + delta;
            }
            finishLoadingOlder();

            // Keep intent as 'preserve' for a short window so late
            // media-loaded events from the newly-prepended block don't
            // trigger a scroll-to-bottom.
            setTimeout(() => {
              if (scrollIntentRef.current === 'preserve') {
                scrollIntentRef.current = 'none';
              }
            }, 500);
          });
        });
      } else {
        finishLoadingOlder();
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      setError(`Failed to load older messages: ${err.message}`);
      finishLoadingOlder();
    }
  }, [conversationId, messages, hasMoreOlder]);

  // ── Scroll listener ──
  const handleScroll = useCallback(() => {
    const listEl = messagesListRef.current;
    if (!listEl) return;

    // Don't trigger loadOlder while mid-prepend (prevents re-entrant loads
    // from our own programmatic scrollTop assignment)
    if (scrollIntentRef.current === 'preserve') return;

    if (listEl.scrollTop < 200) {
      loadOlder();
    }

    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    const isFarFromBottom = distanceFromBottom > SCROLL_BUTTON_THRESHOLD;
    setShowScrollButton(isFarFromBottom);

    if (!isFarFromBottom) {
      setUnreadWhileScrolledUp(0);
    }
  }, [loadOlder]);

  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
  }, []);

  // ── Reset on conversation change ──
  useEffect(() => {
    scrollIntentRef.current = 'none';
    hasDoneInitialScrollRef.current = false;
    setHasMoreOlder(true);
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    setMessages([]);
    markingReadRef.current = new Set();
  }, [conversationId]);

  // ── Main effect: initial fetch + realtime ──
  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    fetchInitialMessages();

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
          // A real new message resets prepend intent
          scrollIntentRef.current = 'none';

          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, payload.new]
          );

          if (clearTypingFor) clearTypingFor(conversationId);

          const listEl = messagesListRef.current;
          const isNearBottom = listEl
            ? listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 200
            : true;

          if (!isNearBottom && payload.new.sender_id !== currentUserId) {
            setUnreadWhileScrolledUp((n) => n + 1);
          }
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
          markingReadRef.current.delete(payload.new.id);
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
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, [conversationId, fetchInitialMessages, scheduleScroll, currentUserId, clearTypingFor]);

  // ── Unified scroll effect ──
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

    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;

    if (distanceFromBottom < 200) {
      scheduleScroll();
    }
  }, [messages, scheduleScroll]);

  // ── Read receipts ──
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

  // ── Unread reset ──
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

  if (!conversation) {
    return (
      <div className="no-conversation">
        <p>Select a conversation to start messaging</p>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading messages...</div>;
  }

  return (
    <>
      <div className="messages-header">
        <h3>Chat</h3>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div
        className="messages-list"
        ref={messagesListRef}
        onScroll={handleScroll}
      >
        {loadingOlder && (
          <div className="messages-loading-older">
            <div className="attachment-progress-spinner" />
            <span>Loading older messages…</span>
          </div>
        )}

        {!hasMoreOlder && messages.length > 0 && (
          <div className="messages-no-more">
            — Beginning of conversation —
          </div>
        )}

        {messages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello.</div>
        ) : (
          <MessagesList
            messages={messages}
            currentUserId={currentUserId}
            conversation={conversation}
            onMediaLoad={handleMediaLoad}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
        <div ref={messagesEndRef} />

        {showScrollButton && (
          <button
            type="button"
            className={`scroll-to-bottom-btn ${
              unreadWhileScrolledUp > 0 ? 'scroll-to-bottom-btn--unread' : ''
            }`}
            onClick={handleScrollToBottom}
            aria-label="Scroll to latest messages"
            title="Scroll to latest"
          >
            ↓
            {unreadWhileScrolledUp > 0 && (
              <span className="scroll-to-bottom-badge">
                {unreadWhileScrolledUp > 9 ? '9+' : unreadWhileScrolledUp}
              </span>
            )}
          </button>
        )}
      </div>

      {isOtherTyping && (
        <div className="typing-indicator">
          <span className="typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          <span className="typing-text">typing…</span>
        </div>
      )}

      <div className="send-message-form">
        <MessageInput
          onSubmit={send}
          onCancel={cancel}
          uploading={uploading}
          error={sendError}
          progress={progress}
          onTyping={sendTyping}
        />
      </div>
    </>
  );
}