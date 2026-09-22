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
  // primitive values, safe for effect deps
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
  const [newMessageDividerId, setNewMessageDividerId] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const markingReadRef = useRef(new Set());
  const channelRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const scrollIntentRef = useRef('none');
  const hasDoneInitialScrollRef = useRef(false);
  const notificationsRequestedRef = useRef(false);

  // Message input ref for exposing addFile method
  const messageInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const scheduleScroll = useCallback((force = false) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollIntentRef.current === 'preserve') return;

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

  // ── Drag-and-drop ──
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    let type = null;
    if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else return;

    messageInputRef.current?.addFile(file, type);
  }, []);

  const handleMediaLoad = useCallback(() => {
    if (scrollIntentRef.current === 'preserve') return;
    const listEl = messagesListRef.current;
    if (!listEl) return;
    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (distanceFromBottom > 500) return;
    scheduleScroll();
  }, [scheduleScroll]);

  // ── Browser notification ──
  const maybeNotify = useCallback(
    (message) => {
      if (message.sender_id === currentUserId) return;
      if (!document.hidden) return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      let body;
      if (message.content && message.content.trim().length > 0) {
        body =
          message.content.length > 80
            ? `${message.content.slice(0, 80)}…`
            : message.content;
      } else if (message.media_type === 'video') {
        body = '📹 Sent a video';
      } else if (message.media_type === 'audio') {
        body = '🎵 Sent an audio file';
      } else {
        body = 'New message';
      }

      try {
        const notification = new Notification('Ceasul Social', {
          body,
          icon: '/favicon.ico',
          tag: `conversation-${message.conversation}`,
          renotify: true,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (err) {
        console.error('Notification error:', err);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    if (notificationsRequestedRef.current) return;
    notificationsRequestedRef.current = true;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    Notification.requestPermission().catch(() => {});
  }, []);

  // ── Send hook ──
  const {
    send,
    cancel,
    uploading,
    error: sendError,
    progress,
    pendingMessages,
    retry: retryMessage,
    dismiss: dismissMessage,
  } = useMessageSender({
    conversationId,
    currentUserId,
    onMessageSent: (msg) => {
      scrollIntentRef.current = 'none';
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      onMessageSentProp?.(msg);
      hasDoneInitialScrollRef.current = true;
      scheduleScroll(true);

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    },
  });

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

  const sendTyping = useCallback(() => {
    if (notifyTyping && conversationId) {
      notifyTyping(conversationId);
    }
  }, [notifyTyping, conversationId]);

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

  const handleScroll = useCallback(() => {
    const listEl = messagesListRef.current;
    if (!listEl) return;

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
      setNewMessageDividerId((prev) => (prev ? null : prev));
    }
  }, [loadOlder]);

  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    setNewMessageDividerId(null);
  }, []);

  // reset on conversation change
  useEffect(() => {
    scrollIntentRef.current = 'none';
    hasDoneInitialScrollRef.current = false;
    setHasMoreOlder(true);
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    setNewMessageDividerId(null);
    setMessages([]);
    markingReadRef.current = new Set();
  }, [conversationId]);

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
          scrollIntentRef.current = 'none';

          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, payload.new]
          );

          if (clearTypingFor) clearTypingFor(conversationId);

          maybeNotify(payload.new);

          const listEl = messagesListRef.current;
          const distanceFromBottom = listEl
            ? listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight
            : null;
          const isNearBottom =
            distanceFromBottom !== null
              ? distanceFromBottom < SCROLL_BUTTON_THRESHOLD
              : true;

          if (!isNearBottom && payload.new.sender_id !== currentUserId) {
            setUnreadWhileScrolledUp((n) => n + 1);
            setNewMessageDividerId((prev) => prev ?? payload.new.id);
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
  }, [
    conversationId,
    fetchInitialMessages,
    scheduleScroll,
    currentUserId,
    clearTypingFor,
    maybeNotify,
  ]);

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
        className={`messages-list ${isDragging ? 'messages-list--dragging' : ''}`}
        ref={messagesListRef}
        onScroll={handleScroll}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              <div className="drop-overlay-icon">📎</div>
              <div className="drop-overlay-text">Drop video or audio here</div>
            </div>
          </div>
        )}

        {loadingOlder && (
          <div className="messages-loading-older">
            <div className="attachment-progress-spinner" />
            <span>Loading older messages...</span>
          </div>
        )}

        {!hasMoreOlder && messages.length > 0 && (
          <div className="messages-no-more">
            — Beginning of conversation —
          </div>
        )}

        {messages.length === 0 && pendingMessages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello.</div>
        ) : (
          <MessagesList
            messages={[...messages, ...pendingMessages]}
            currentUserId={currentUserId}
            conversation={conversation}
            onMediaLoad={handleMediaLoad}
            onDeleteMessage={handleDeleteMessage}
            onRetryMessage={retryMessage}
            onDismissMessage={dismissMessage}
            newMessageDividerId={newMessageDividerId}
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
          <span className="typing-text">typing...</span>
        </div>
      )}

      <div className="send-message-form">
        <MessageInput
          ref={messageInputRef}
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