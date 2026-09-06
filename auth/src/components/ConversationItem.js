import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

function ConversationItem({ conversation, currentUserId, onClick, isActive }) {
  const [otherUser, setOtherUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const otherUserId = conversation.user1_id === currentUserId
    ? conversation.user2_id
    : conversation.user1_id;

  // Check unread count
  const isUser1 = currentUserId === conversation.user1_id;
  const unreadCount = isUser1
    ? (conversation.unread_count_user1 || 0)
    : (conversation.unread_count_user2 || 0);

  // FIX: glow appearing even while this chat is open.
  // Previously this only depended on unreadCount, relying entirely on
  // an async reset-to-0 request landing before the glow could render —
  // which is a race, not a guarantee. isActive (passed down from
  // ConversationsList, true when this is the currently-selected
  // conversation) makes it structurally impossible for the glow to
  // show while you're looking at this exact conversation, regardless
  // of any timing race with the unread-count reset.
  const hasUnread = unreadCount > 0 && !isActive;

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

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / (60 * 1000));
      return `${mins}m ago`;
    }
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const lastMessage = conversation.last_message || 'No messages yet';
  const timeAgo = formatTime(conversation.updated_at);

  // Mark as read when clicked. Still useful as a backstop / for the
  // moment of the click itself, even though isActive above now
  // guarantees the glow won't render once this becomes the open chat.
  const handleClick = () => {
    if (unreadCount > 0) {
      const updateField = isUser1 ? 'unread_count_user1' : 'unread_count_user2';
      supabase
        .from('conversations')
        .update({ [updateField]: 0 })
        .eq('id', conversation.id)
        .then(() => {
          if (onClick) onClick(conversation);
        });
    } else {
      if (onClick) onClick(conversation);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        backgroundColor: 'transparent',
        position: 'relative',
        border: hasUnread ? '2px solid #00bcd4' : '2px solid transparent',
        boxShadow: hasUnread ? '0 0 20px rgba(0, 188, 212, 0.15)' : 'none',
        marginBottom: '2px',
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
          fontWeight: hasUnread ? '700' : '600',
          letterSpacing: '0.3px'
        }}>
          {displayName}
        </span>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            color: '#72767d',
            fontSize: '11px',
            fontWeight: '400'
          }}>
            {timeAgo}
          </span>
          {hasUnread && (
            <span style={{
              backgroundColor: '#00bcd4',
              color: '#181a1b',
              fontSize: '11px',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '12px',
              minWidth: '20px',
              textAlign: 'center',
              animation: 'pulse-badge 1.5s ease-in-out infinite',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
      <div style={{
        color: hasUnread ? '#ffffff' : '#b9bbbe',
        fontSize: '13px',
        opacity: hasUnread ? 1 : 0.8,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: hasUnread ? '500' : '400',
      }}>
        {lastMessage}
        {lastMessage === 'No messages yet' && (
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