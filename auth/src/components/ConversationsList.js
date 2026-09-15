// src/components/ConversationsList.js
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import ConversationItem from './ConversationItem';
import ConversationView from './ConversationView';
import { useGlobalTyping } from '../hooks/useGlobalTyping';
import './ConversationsList.css';

function getPreviewText(message) {
  if (message.content && message.content.trim().length > 0) {
    return message.content;
  }
  if (message.media_type === 'video') return '📹 Sent a video';
  if (message.media_type === 'audio') return '🎵 Sent an audio file';
  if (message.media_type) return '📎 Sent an attachment';
  return 'New message';
}

export default function ConversationsList() {
  const { user } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  // ✅ Global typing state — persists across conversation switches
  const { typingConversations, notifyTyping, clearTypingFor } =
    useGlobalTyping(userId);

  const handleMessageSent = useRef((message) => {
    const preview = getPreviewText(message);
    const timestamp = message.created_at || new Date().toISOString();

    setConversations((prev) => {
      const updated = prev.map((conv) => {
        if (conv.id === message.conversation) {
          return {
            ...conv,
            last_message: preview,
            updated_at: timestamp,
          };
        }
        return conv;
      });
      return updated.sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
    });

    setSelected((prev) =>
      prev?.id === message.conversation
        ? { ...prev, last_message: preview, updated_at: timestamp }
        : prev
    );
  }).current;

  useEffect(() => {
    isMounted.current = true;

    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchInitial = async () => {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        if (!isMounted.current) return;
        setConversations(data || []);

        const convId = location.state?.conversationId;
        if (convId) {
          const found = data?.find((c) => c.id === convId);
          if (found) {
            setSelected(found);
            navigate('/conversations', { replace: true });
          } else if (data?.length > 0) {
            setSelected(data[0]);
          }
        } else if (data?.length > 0) {
          setSelected(data[0]);
        }
      } catch (err) {
        console.error('Error fetching conversations:', err);
        if (isMounted.current) setConversations([]);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };

    fetchInitial();

    // Realtime: conversation updates
    const conversationChannel = supabase
      .channel('conversations_channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          if (!isMounted.current) return;
          setConversations((prev) => {
            const updated = prev.map((conv) =>
              conv.id === payload.new.id ? payload.new : conv
            );
            return updated.sort(
              (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
            );
          });
          setSelected((prev) => {
            if (prev?.id === payload.new.id) return payload.new;
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          if (!isMounted.current) return;
          setConversations((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    // Realtime: new messages
    const messageChannel = supabase
      .channel('messages_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (!isMounted.current) return;
          const preview = getPreviewText(payload.new);
          const timestamp = payload.new.created_at || new Date().toISOString();

          setConversations((prev) => {
            const updated = prev.map((conv) => {
              if (conv.id === payload.new.conversation) {
                return {
                  ...conv,
                  last_message: preview,
                  updated_at: timestamp,
                };
              }
              return conv;
            });
            return updated.sort(
              (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
            );
          });

          // ✅ Any incoming message = typing has stopped
          if (payload.new.sender_id !== userId) {
            clearTypingFor(payload.new.conversation);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(conversationChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [userId, location.state, navigate, clearTypingFor]);

  if (loading) {
    return <div className="loading">Loading conversations...</div>;
  }

  if (!conversations.length) {
    return <div className="loading">No conversations yet.</div>;
  }

  return (
    <div className="conversations-page">
      <div className="conversations-list">
        <h2>Conversations</h2>
        <ul>
          {conversations.map((conv) => (
            <li
              key={conv.id}
              onClick={() => setSelected(conv)}
              className={selected?.id === conv.id ? 'active' : ''}
            >
              <ConversationItem
                conversation={conv}
                currentUserId={userId}
                onClick={() => setSelected(conv)}
                isActive={selected?.id === conv.id}
                isTyping={!!typingConversations[conv.id]}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="messages-section">
        <ConversationView
          conversation={selected}
          currentUserId={userId}
          onMessageSent={handleMessageSent}
          notifyTyping={notifyTyping}
          clearTypingFor={clearTypingFor}
          isOtherTyping={!!typingConversations[selected?.id]}
        />
      </div>
    </div>
  );
}