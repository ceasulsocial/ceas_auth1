import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import './ConversationsList.css';

export default function ConversationView({ conversation, currentUserId, onMessageSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const markingReadRef = useRef(new Set());
  const channelRef = useRef(null);
  const isInitialLoad = useRef(true);

  const scrollToBottomInstant = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversation) return;
    
    try {
      console.log('📥 Fetching messages for conversation:', conversation.id);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      console.log('📥 Fetched messages:', data?.length || 0);
      
      setMessages(data || []);
      setError(null);
      
      setTimeout(() => {
        scrollToBottomInstant();
      }, 50);
      
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [conversation, scrollToBottomInstant]);

  // Initial fetch and scroll to bottom
  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      return;
    }

    isInitialLoad.current = true;
    setLoading(true);
    fetchMessages();

    // Clean up old subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    console.log('🔌 Setting up Realtime subscription for conversation:', conversation.id);

    // Create new subscription
    const channel = supabase
      .channel(`messages_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversation.id}`
        },
        (payload) => {
          console.log('🟢 INSERT event received:', payload.new);
          
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) {
              return prev;
            }
            return [...prev, payload.new];
          });
          
          //  Scroll to bottom instantly on new message
          setTimeout(() => {
            scrollToBottomInstant();
          }, 10);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversation.id}`
        },
        (payload) => {
          console.log(' UPDATE event received:', payload.new);
          setMessages(prev => prev.map(m => 
            m.id === payload.new.id ? payload.new : m
          ));
          markingReadRef.current.delete(payload.new.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation=eq.${conversation.id}`
        },
        (payload) => {
          console.log('🔴 DELETE event received:', payload.old);
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('❌ Realtime subscription error:', err);
        }
        console.log('📡 Realtime channel status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log('🧹 Cleaning up channel');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversation, fetchMessages, scrollToBottomInstant]);

  // 🔥 Scroll to bottom instantly whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottomInstant();
    }
    isInitialLoad.current = false;
  }, [messages, scrollToBottomInstant]);

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

  const handleSend = async (content) => {
    if (!content.trim() || !conversation) return;

    try {
      const now = new Date().toISOString();
      
      const newMessage = {
        conversation: conversation.id,
        sender_id: currentUserId,
        content: content.trim(),
        created_at: now,
        read_user1: currentUserId === conversation.user1_id,
        read_user2: currentUserId === conversation.user2_id,
      };

      console.log('📤 Sending message:', newMessage);

      // Insert the message
      const { data, error } = await supabase
        .from('messages')
        .insert(newMessage)
        .select();

      if (error) {
        console.error('❌ Insert error:', error);
        throw error;
      }

      console.log('✅ Message inserted successfully:', data);
      
      // Update the conversation
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          last_message: content.trim(),
          updated_at: now
        })
        .eq('id', conversation.id);

      if (updateError) {
        console.error('❌ Error updating conversation:', updateError);
      }

      // Notify parent to update conversation list
      if (onMessageSent && data && data.length > 0) {
        onMessageSent(data[0]);
      }

      // Optimistically update UI
      if (data && data.length > 0) {
        setMessages(prev => {
          if (prev.some(m => m.id === data[0].id)) {
            return prev;
          }
          return [...prev, data[0]];
        });
        
        // 🔥 Scroll to bottom instantly after sending
        setTimeout(() => {
          scrollToBottomInstant();
        }, 10);
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
          ⚠️ {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="messages-list">
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello! 👋</div>
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
        <MessageInput onSend={handleSend} />
      </div>
    </>
  );
}