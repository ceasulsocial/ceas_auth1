import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import { useMessageSender } from '../hooks/useMessageSender';
import './ConversationsList.css';

const SCROLL_BUTTON_THRESHOLD = 300;

export default function ConversationView({
  conversation,
  currentUserId,
  onMessageSent: onMessageSentProp,
  notifyTyping,
  clearTypingFor,
  isOtherTyping,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const markingReadRef = useRef(new Set());
  const channelRef = useRef(null);
  const scrollTimerRef = useRef(null);

  // Scroll-to-bottom button state
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState(0);

  const scheduleScroll = useCallback(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        });
      });
    }, 50);
  }, []);

  const {
    send,
    cancel,
    uploading,
    error: sendError,
    progress,
  } = useMessageSender({
    conversationId: conversation?.id,
    currentUserId,
    onMessageSent: (msg) => {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      onMessageSentProp?.(msg);
      scheduleScroll();
    },
  });

  // Delete handler
  const handleDeleteMessage = useCallback(
    async (message) => {
      if (!message || !conversation) return;
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
        .update({
          deleted_at: deletedAt,
          deleted_by: currentUserId,
        })
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
    [conversation, currentUserId]
  );

  const sendTyping = useCallback(() => {
    if (notifyTyping && conversation?.id) {
      notifyTyping(conversation.id);
    }
  }, [notifyTyping, conversation?.id]);

  // Scroll handler for the messages list
  const handleMessagesScroll = useCallback(() => {
    const listEl = messagesListRef.current;
    if (!listEl) return;

    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;

    const isFarFromBottom = distanceFromBottom > SCROLL_BUTTON_THRESHOLD;
    setShowScrollButton(isFarFromBottom);

    if (!isFarFromBottom) {
      setUnreadWhileScrolledUp(0);
    }
  }, []);

  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    if (!conversation) return;

    const fetchInitialMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation', conversation.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching messages:', err);
        setError(`Failed to load messages: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    setUnreadWhileScrolledUp(0);
    setShowScrollButton(false);
    fetchInitialMessages();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel('messages_' + conversation.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, payload.new]
          );

          if (clearTypingFor) clearTypingFor(conversation.id);

          // If user is scrolled up, don't yank them down.
          // Instead, bump the button's unread badge.
          const listEl = messagesListRef.current;
          if (listEl) {
            const distanceFromBottom =
              listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;

            if (distanceFromBottom > SCROLL_BUTTON_THRESHOLD) {
              if (payload.new.sender_id !== currentUserId) {
                setUnreadWhileScrolledUp((n) => n + 1);
              }
              return;
            }
          }

          scheduleScroll();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversation.id}`,
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
          filter: `conversation=eq.${conversation.id}`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, scheduleScroll, currentUserId, clearTypingFor]);

  useEffect(() => {
    if (messages.length > 0) {
      scheduleScroll();
    }
  }, [messages, scheduleScroll]);

  // Read receipts
  useEffect(() => {
    if (!conversation || messages.length === 0) return;

    const isUser1 = currentUserId === conversation.user1_id;
    const myReadColumn = isUser1 ? 'read_user1' : 'read_user2';

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
  }, [messages, conversation, currentUserId]);

  // Reset unread count while viewing
  useEffect(() => {
    if (!conversation) return;
    const isUser1 = currentUserId === conversation.user1_id;
    const myUnreadColumn = isUser1
      ? 'unread_count_user1'
      : 'unread_count_user2';
    const currentUnread = conversation[myUnreadColumn] || 0;
    if (currentUnread === 0) return;

    supabase
      .from('conversations')
      .update({ [myUnreadColumn]: 0 })
      .eq('id', conversation.id)
      .then(({ error }) => {
        if (error) console.error('Error resetting unread count:', error);
      });
  }, [conversation, messages, currentUserId]);

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
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello.</div>
        ) : (
          <MessagesList
            messages={messages}
            currentUserId={currentUserId}
            conversation={conversation}
            onMediaLoad={scheduleScroll}
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