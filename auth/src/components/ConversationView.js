import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import { useMessageSender } from '../hooks/useMessageSender';
import './ConversationsList.css';

export default function ConversationView({
  conversation,
  currentUserId,
  onMessageSent: onMessageSentProp,
  onTypingChange,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  // Tracks message ids currently being marked as read, so an in-flight
  // update can't be triggered again before it resolves.
  const markingReadRef = useRef(new Set());
  const channelRef = useRef(null);
  const scrollTimerRef = useRef(null);

  // Typing indicator state
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  // Tuning:
  // - Send at most one typing broadcast per 3s.
  // - Assume typing stopped if no event within 5s.
  const TYPING_SEND_THROTTLE_MS = 3000;
  const TYPING_STOP_TIMEOUT_MS = 5000;

  // Notifies the parent (ConversationsList) so the sidebar can show
  // "typing…" on the matching conversation. Only the currently-open
  // conversation has an active channel, so this only ever fires for it.
  const notifyTypingChange = useCallback(
    (isTyping) => {
      onTypingChange?.(conversation?.id, isTyping);
    },
    [conversation?.id, onTypingChange]
  );

  const setOtherTypingAndNotify = useCallback(
    (isTyping) => {
      setOtherTyping(isTyping);
      notifyTypingChange(isTyping);
    },
    [notifyTypingChange]
  );

  // Throttled typing broadcast
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_SEND_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId },
    });
  }, [currentUserId]);

  // Scroll schedule
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
    setOtherTypingAndNotify(false);
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
                if (payload.new.sender_id !== currentUserId) {
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = null;
            }
            setOtherTypingAndNotify(false);
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
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // Ignore our own broadcast — Realtime echoes broadcasts back to the sender.
        if (payload.userId === currentUserId) return;

        setOtherTypingAndNotify(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        // No explicit "stopped typing" event is sent — if no further
        // typing event arrives within the timeout, assume they stopped.
        typingTimeoutRef.current = setTimeout(() => {
          setOtherTypingAndNotify(false);
        }, TYPING_STOP_TIMEOUT_MS);
      })
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
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, scheduleScroll, currentUserId]);

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

      <div className="messages-list">
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello.</div>
        ) : (
          <MessagesList
            messages={messages}
            currentUserId={currentUserId}
            conversation={conversation}
            onMediaLoad={scheduleScroll}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {otherTyping && (
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