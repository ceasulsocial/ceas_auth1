import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import './ConversationsList.css';

export default function ConversationView({ conversation, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  // Tracks message ids currently being marked as read, so an in-flight
  // update can't be triggered again before it resolves.
  const markingReadRef = useRef(new Set());

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

    // Each event type is handled separately, patching local state
    // directly from the payload instead of re-querying the whole
    // table on every change.
    const channel = supabase
      .channel('messages_' + conversation.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation=eq.${conversation.id}` },
        (payload) => {
          setMessages(prev =>
            prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation=eq.${conversation.id}` },
        (payload) => {
          setMessages(prev => prev.map(m => (m.id === payload.new.id ? payload.new : m)));
          markingReadRef.current.delete(payload.new.id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation=eq.${conversation.id}` },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('Realtime subscription error:', err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // Depends only on the conversation id, not the whole object — the
    // parent replaces the conversation object on every unread-count or
    // last-message update, and re-running this effect on every one of
    // those would tear down and rebuild the subscription unnecessarily.
  }, [conversation?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

    const markRead = async () => {
      const { error } = await supabase
        .from('messages')
        .update({ [myReadColumn]: true })
        .in('id', unreadIds);

      if (error) {
        console.error('Error marking messages read:', error);
        unreadIds.forEach((id) => markingReadRef.current.delete(id));
      }
    };

    markRead();
  }, [messages, conversation, currentUserId]);

  // Keeps the currently-open conversation's unread count pinned at 0:
  // once when it's opened, and again whenever a new message arrives
  // live while it's open.
  useEffect(() => {
    if (!conversation) return;

    const isUser1 = currentUserId === conversation.user1_id;
    const myUnreadColumn = isUser1 ? 'unread_count_user1' : 'unread_count_user2';
    const currentUnread = conversation[myUnreadColumn] || 0;

    if (currentUnread === 0) return;

    const resetUnread = async () => {
      const { error } = await supabase
        .from('conversations')
        .update({ [myUnreadColumn]: 0 })
        .eq('id', conversation.id);

      if (error) console.error('Error resetting unread count:', error);
    };

    resetUnread();
  }, [conversation, messages, currentUserId]);

  const handleSend = async (content) => {
    if (!content.trim() || !conversation) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation: conversation.id,
          sender_id: currentUserId,
          content: content.trim(),
          created_at: new Date().toISOString(),
          read_user1: currentUserId === conversation.user1_id,
          read_user2: currentUserId === conversation.user2_id,
        })
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(prev =>
          prev.some(m => m.id === data[0].id) ? prev : [...prev, data[0]]
        );
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(`Failed to send message: ${err.message}`);
    }
  };

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
          <MessagesList messages={messages} currentUserId={currentUserId} conversation={conversation} />
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="send-message-form">
        <MessageInput
          onSend={handleSend}
          conversationId={conversation.id}
          currentUserId={currentUserId}
          onMediaUpload={() => {}}
        />
      </div>
    </>
  );
}