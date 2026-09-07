import { useState, useEffect, useCallback } from 'react';
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

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      setConversations(data);
      
      const convId = location.state?.conversationId;
      if (convId) {
        const found = data.find(c => c.id === convId);
        if (found) {
          setSelected(found);
          navigate('/conversations', { replace: true });
        }
      } else if (data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [userId, location.state, navigate, selected]);

  useEffect(() => {
    if (!userId) return;
    
    setLoading(true);
    fetchConversations();

    const channel = supabase
      .channel('conversations')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'conversations' }, 
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  if (loading) return <div className="loading">Loading conversations...</div>;
  if (!conversations.length) return <div className="loading">No conversations yet.</div>;

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
              <ConversationItem conversation={conv} currentUserId={userId} />
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