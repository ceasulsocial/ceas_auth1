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
          .from('profiles')  // ✅ FIXED: Changed from 'users' to 'profiles'
          .select('full_name')  // ✅ FIXED: Changed from 'username' to 'full_name'
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
    : otherUser?.full_name || `User ${otherUserId.slice(0, 8)}`;  // ✅ FIXED: full_name

  return (
    <div 
      onClick={() => onClick?.(conversation)}
      style={{ 
        border: '1px solid #e0e0e0', 
        borderRadius: '8px', 
        padding: '15px', 
        marginBottom: '10px',
        backgroundColor: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f8f9fa';
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#fff';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <strong style={{ fontSize: '16px', color: '#2c3e50' }}>
            {displayName}
          </strong>
        </div>
        <small style={{ color: '#7f8c8d' }}>
          {new Date(conversation.updated_at).toLocaleString()}
        </small>
      </div>
      <p style={{ 
        margin: '8px 0 0 0', 
        color: '#555',
        fontSize: '14px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {conversation.last_message || 'No messages yet'}
      </p>
    </div>
  );
}

export default ConversationItem;