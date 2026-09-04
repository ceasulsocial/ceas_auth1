import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import ConversationItem from './ConversationItem';
import ConversationView from './ConversationView';

export default function ConversationsList() {
  const { user } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      if (error) {
        setConversations([]);
      } else {
        setConversations(data);
        // Always check for a conversationId in location.state and select it
        const convId = location.state?.conversationId;
        if (convId) {
          const found = data.find(c => c.id === convId);
          if (found) {
            setSelected(found);
            // Clear the state so it doesn't keep re-selecting
            navigate('/conversations', { replace: true });
          }
        } else if (data.length && !selected) {
          setSelected(data[0]);
        }
      }
      setLoading(false);
    };
    fetchConversations();
    // Real-time updates
    const channel = supabase
      .channel('conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, payload => {
        fetchConversations();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line
  }, [userId, location.state]);

  if (loading) return <div>Loading conversations...</div>;
  if (!conversations.length) return <div>No conversations yet.</div>;

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <div style={{ minWidth: 260, maxWidth: 320 }}>
        <h2 style={{ color: '#00bcd4' }}>Conversations</h2>
        {conversations.map(conv => (
          <div key={conv.id} onClick={() => setSelected(conv)} style={{ cursor: 'pointer', background: selected?.id === conv.id ? '#23272a' : 'transparent', borderRadius: 8 }}>
            <ConversationItem conversation={conv} currentUserId={userId} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ConversationView conversation={selected} currentUserId={userId} />
      </div>
    </div>
  );
}