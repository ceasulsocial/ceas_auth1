import { useEffect, useRef, useState } from 'react';
import './ConversationsList.css';

export default function MessagesList({ messages, currentUserId, conversation }) {
  const endRef = useRef(null);
  const [mediaErrors, setMediaErrors] = useState({});

  useEffect(() => {
    if (messages.length > 0 && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'instant' });
    }
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
    if (!msg.media_url || mediaErrors[msg.id]) {
      return null;
    }

    if (msg.media_type === 'video') {
      return (
        <div style={styles.mediaContainer}>
          <video
            controls
            style={styles.videoPlayer}
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
        <div style={styles.audioContainer}>
          <audio
            controls
            style={styles.audioPlayer}
            onError={() => handleMediaError(msg.id)}
          >
            <source src={msg.media_url} />
            Your browser does not support audio.
          </audio>
          <span style={styles.audioIcon}>🎵</span>
        </div>
      );
    }

    return null;
  };

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
        const hasContent = msg.content && msg.content !== '📹 Video: undefined';

        return (
          <div
            key={msg.id}
            className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
          >
            <div className={`message ${isOwn ? 'own' : ''}`}>
              {/* Show media if present, otherwise show text */}
              {hasMedia ? (
                renderMedia(msg)
              ) : (
                hasContent && <div>{msg.content}</div>
              )}

              {/* Show error if media failed */}
              {mediaErrors[msg.id] && msg.media_url && (
                <div style={styles.mediaError}>
                  {msg.media_type === 'video' ? '📹' : '🎵'} Media unavailable
                </div>
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

const styles = {
  mediaContainer: {
    maxWidth: '400px',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  videoPlayer: {
    width: '100%',
    maxHeight: '400px',
    borderRadius: '8px',
    backgroundColor: '#000',
  },
  audioContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: '8px',
    marginBottom: '4px',
    minWidth: '250px',
  },
  audioPlayer: {
    flex: 1,
    height: '40px',
  },
  audioIcon: {
    fontSize: '24px',
  },
  mediaError: {
    color: '#ed4245',
    padding: '8px',
    fontSize: '14px',
  },
};