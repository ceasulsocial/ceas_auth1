import { useState, useEffect, useCallback, useRef } from 'react';
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
  const isInitialMount = useRef(true);

  // Define fetchConversations with useCallback
  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      
      if (error) {
        setConversations([]);
        return;
      }
      
      setConversations(data);
      
      // Handle selection logic
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

  // Effect for initial fetch and real-time subscription
  useEffect(() => {
    if (!userId) return;
    
    setLoading(true);
    fetchConversations();

    // Real-time subscription
    const channel = supabase
      .channel('conversations')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'conversations' 
        }, 
        () => {
          // Only refetch if not a reconnection
          if (!isInitialMount.current) {
            fetchConversations();
          }
          isInitialMount.current = false;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  // Separate effect for handling navigation state changes
  useEffect(() => {
    const convId = location.state?.conversationId;
    if (convId && conversations.length > 0) {
      const found = conversations.find(c => c.id === convId);
      if (found && found.id !== selected?.id) {
        setSelected(found);
        navigate('/conversations', { replace: true });
      }
    }
  }, [location.state, conversations, navigate, selected]);

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
        <ConversationView conversation={selected} currentUserId={userId} />
      </div>
    </div>
  );
}