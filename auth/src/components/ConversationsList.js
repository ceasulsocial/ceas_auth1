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

    const conversationChannel = supabase
      .channel('conversations_channel')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          if (!isMounted.current) return;
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
          setConversations(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    // Updates last_message locally for immediate display in the
    // sidebar; the actual persisted last_message/updated_at/unread
    // counts come from the database trigger on the messages table.
    const messageChannel = supabase
      .channel('messages_channel')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (!isMounted.current) return;
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
          {conversations.map(conv => (
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
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="messages-section">
        <ConversationView
          conversation={selected}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}