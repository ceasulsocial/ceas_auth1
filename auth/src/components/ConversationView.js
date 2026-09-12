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

  // Debounced so a burst of incoming messages doesn't trigger a scroll
  // call per message.
  const scheduleScroll = useCallback(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
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
    // Depends only on the conversation id, not the whole object — the
    // parent replaces the conversation object on every unread-count or
    // last-message update, and re-running this on every one of those
    // would tear down and rebuild the subscription unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, scheduleScroll]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages]);

  // Read receipts, using the read_user1 / read_user2 columns. Guarded
  // against re-firing on ids already being marked, so an UPDATE event
  // can't accidentally trigger a duplicate in-flight request.
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

  // Keeps the currently-open conversation's unread count pinned at 0.
  // messages must stay in the dependency list: without it, this only
  // resets the count once on open, and a message arriving live while
  // already viewing the conversation would increment the count with
  // nothing to clear it back to 0 again.
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
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="send-message-form">
        <MessageInput
          onSubmit={send}
          onCancel={cancel}
          uploading={uploading}
          error={sendError}
          progress={progress}
        />
      </div>
    </>
  );
}