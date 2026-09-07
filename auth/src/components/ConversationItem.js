import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

function ConversationItem({ conversation, currentUserId, onClick }) {
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const otherUserId = conversation.user1_id === currentUserId 
    ? conversation.user2_id 
    : conversation.user1_id;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', otherUserId)
          .single();
        
        if (error) throw error;
        setOtherUser(data);
      } catch (err) {
        console.error('Error fetching user:', err);
        setOtherUser({ full_name: `User ${otherUserId.slice(0, 8)}` });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUser();
  }, [otherUserId]);

  const displayName = loading 
    ? 'Loading...' 
    : otherUser?.full_name || `User ${otherUserId.slice(0, 8)}`;

  return (
    <div 
      onClick={() => onClick?.(conversation)}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        backgroundColor: 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
      }}>
        <span style={{
          color: '#ffffff',
          fontSize: '15px',
          fontWeight: '600',
          letterSpacing: '0.3px'
        }}>
          {displayName}
        </span>
        <span style={{
          color: '#72767d',
          fontSize: '11px',
          fontWeight: '400'
        }}>
          {new Date(conversation.updated_at).toLocaleString()}
        </span>
      </div>
      <div style={{
        color: '#b9bbbe',
        fontSize: '13px',
        opacity: 0.8,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {conversation.last_message || 'No messages yet'}
        {!conversation.last_message && (
          <span style={{
            fontSize: '10px',
            color: '#72767d',
            fontStyle: 'italic'
          }}>
            • Start chatting
          </span>
        )}
      </div>
    </div>
  );
}

export default ConversationItem;