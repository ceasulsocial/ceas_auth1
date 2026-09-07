import { useEffect, useRef, useState } from 'react';
import './ConversationsList.css';

export default function MessagesList({ messages, currentUserId, conversation }) {
  const endRef = useRef(null);
  const [mediaErrors, setMediaErrors] = useState({});
  const isInitialRender = useRef(true);

  // ✅ Scroll to bottom with RAF to prevent layout shift
  useEffect(() => {
    if (messages.length > 0 && endRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
    isInitialRender.current = false;
  }, [messages]);

  const isUser1 = conversation && currentUserId === conversation.user1_id;
  const otherReadColumn = isUser1 ? 'read_user2' : 'read_user1';

  let lastOwnMessageId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_id === currentUserId) {
      lastOwnMessageId = messages[i].id;
      break;
    }
  }

  const handleMediaError = (messageId) => {
    setMediaErrors(prev => ({ ...prev, [messageId]: true }));
  };

  const renderMedia = (msg) => {
    if (!msg.media_url || mediaErrors[msg.id]) return null;

    if (msg.media_type === 'video') {
      return (
        <div className="message-media">
          <video
            controls
            onError={() => handleMediaError(msg.id)}
            preload="metadata"
          >
            <source src={msg.media_url} type="video/mp4" />
            Your browser does not support video.
          </video>
        </div>
      );
    }

    if (msg.media_type === 'audio') {
      return (
        <div className="message-audio">
          <audio
            controls
            onError={() => handleMediaError(msg.id)}
          >
            <source src={msg.media_url} />
            Your browser does not support audio.
          </audio>
        </div>
      );
    }

    return null;
  };

  // ✅ If no messages, show empty state
  if (messages.length === 0) {
    return (
      <div className="no-messages" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        height: '100%',
        color: '#99aab5',
        fontSize: '16px',
        padding: '20px'
      }}>
        No messages yet. Say hello. 👋
      </div>
    );
  }

  return (
    <>
      {messages.map((msg) => {
        const isOwn = msg.sender_id === currentUserId;
        const showSeen =
          isOwn &&
          conversation &&
          msg.id === lastOwnMessageId &&
          msg[otherReadColumn];

        const hasMedia = msg.media_url && !mediaErrors[msg.id];
        const hasContent = msg.content && msg.content !== 'Video: undefined';

        return (
          <div
            key={msg.id}
            className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
          >
            <div className={`message ${isOwn ? 'own' : ''}`}>
              {hasMedia ? (
                renderMedia(msg)
              ) : (
                hasContent && <div>{msg.content}</div>
              )}

              {mediaErrors[msg.id] && msg.media_url && (
                <div className="message-media-error">Media unavailable</div>
              )}

              <div className="msg-meta">
                {new Date(msg.created_at).toLocaleString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  month: 'short',
                  day: 'numeric',
                  hour12: true
                })}
                {showSeen && <span className="msg-seen"> · Seen</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </>
  );
}