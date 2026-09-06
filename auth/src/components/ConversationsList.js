import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import ConversationItem from './ConversationItem';
import ConversationView from './ConversationView';
import './ConversationsList.css';

export default function ConversationsList() {
  const { user } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  // ✅ INITIAL FETCH + REAL-TIME
  useEffect(() => {
    isMounted.current = true;

    if (!userId) {
      setLoading(false);
      return;
    }

    // ✅ Fetch initial data
    const fetchInitial = async () => {
      try {
        console.log('📥 Fetching initial conversations...');
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        console.log('📥 Fetched conversations:', data?.length || 0);

        if (!isMounted.current) return;
        setConversations(data || []);

        // Set initial selection
        const convId = location.state?.conversationId;
        if (convId) {
          const found = data?.find(c => c.id === convId);
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

    // ✅ REAL-TIME SUBSCRIPTION
    const conversationChannel = supabase
      .channel('conversations_channel')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          if (!isMounted.current) return;
          console.log('🔄 Conversation updated:', payload.new.id);
          setConversations(prev => {
            const updated = prev.map(conv =>
              conv.id === payload.new.id ? payload.new : conv
            );
            return updated.sort((a, b) =>
              new Date(b.updated_at) - new Date(a.updated_at)
            );
          });
          setSelected(prev => {
            if (prev?.id === payload.new.id) return payload.new;
            return prev;
          });
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          if (!isMounted.current) return;
          console.log('🆕 New conversation:', payload.new.id);
          setConversations(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    // ✅ Listen for new messages from others
    const messageChannel = supabase
      .channel('messages_channel')
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          if (!isMounted.current) return;

          // ✅ Update conversation when ANY new message arrives
          setConversations(prev => {
            const updated = prev.map(conv => {
              if (conv.id === payload.new.conversation) {
                return {
                  ...conv,
                  last_message: payload.new.content,
                  updated_at: new Date().toISOString()
                };
              }
              return conv;
            });
            return updated.sort((a, b) =>
              new Date(b.updated_at) - new Date(a.updated_at)
            );
          });
        }
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(conversationChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [userId, location.state, navigate]);

  // ✅ Handle message sent
  const handleMessageSent = (message) => {
    setConversations(prev => {
      const updated = prev.map(conv => {
        if (conv.id === message.conversation) {
          return {
            ...conv,
            last_message: message.content,
            updated_at: new Date().toISOString()
          };
        }
        return conv;
      });
      return updated.sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
      );
    });
  };

  if (loading) {
    return <div className="loading">Loading conversations...</div>;
  }

  if (!conversations.length && !loading) {
    return <div className="loading">No conversations yet.</div>;
  }

  return (
    <div className="conversations-page">
      <div className="conversations-list">
        <h2>💬 Conversations</h2>
        <ul>
          {conversations.map(conv => (
            <li
              key={conv.id}
              onClick={() => setSelected(conv)}
              className={selected?.id === conv.id ? 'active' : ''}
            >
              {/* FIX: glow appearing while the chat is open.
                  isActive tells ConversationItem this is the
                  currently-open conversation, so it can suppress the
                  glow/badge unconditionally instead of only relying on
                  the async unread-count reset landing in time. */}
              <ConversationItem
                conversation={conv}
                currentUserId={userId}
                isActive={selected?.id === conv.id}
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
        />
      </div>
    </div>
  );
}