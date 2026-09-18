// src/components/MessagesList.js
import { useState, Fragment } from 'react';
import './ConversationsList.css';

function linkify(text) {
  if (typeof text !== 'string') return text;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="message-link"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function MessagesList({
  messages,
  currentUserId,
  conversation,
  onMediaLoad,
  onDeleteMessage,
  newMessageDividerId,
}) {
  const [mediaErrors, setMediaErrors] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const isUser1 = conversation && currentUserId === conversation.user1_id;
  const otherReadColumn = isUser1 ? 'read_user2' : 'read_user1';

  let lastOwnMessageId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_id === currentUserId && !m.deleted_at) {
      lastOwnMessageId = m.id;
      break;
    }
  }

  const handleMediaError = (messageId) => {
    setMediaErrors((prev) => ({ ...prev, [messageId]: true }));
  };

  const handleCopy = async (msg) => {
    const textToCopy = msg.content || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(msg.id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === msg.id ? null : prev));
      }, 1200);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderMedia = (msg) => {
    if (!msg.media_url || mediaErrors[msg.id]) return null;

    if (msg.media_type === 'video') {
      return (
        <div className="message-media">
          <video
            controls
            onError={() => handleMediaError(msg.id)}
            onLoadedMetadata={onMediaLoad}
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
          <span className="message-audio-icon" aria-hidden="true">🎵</span>
          <audio
            controls
            onError={() => handleMediaError(msg.id)}
            onLoadedMetadata={onMediaLoad}
          >
            <source src={msg.media_url} />
            Your browser does not support audio.
          </audio>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {messages.map((msg) => {
        const isOwn = msg.sender_id === currentUserId;
        const isDeleted = !!msg.deleted_at;

        const showSeen =
          !isDeleted &&
          isOwn &&
          conversation &&
          msg.id === lastOwnMessageId &&
          msg[otherReadColumn];

        const hasMedia = !isDeleted && msg.media_url && !mediaErrors[msg.id];
        const hasContent =
          !isDeleted &&
          typeof msg.content === 'string' &&
          msg.content.trim().length > 0;

        return (
          <Fragment key={msg.id}>
            {newMessageDividerId === msg.id && (
              <div className="new-messages-divider">
                <span>New messages</span>
              </div>
            )}

            <div
              className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
            >
              <div
                className={`message ${isOwn ? 'own' : ''} ${
                  isDeleted ? 'message--deleted' : ''
                }`}
              >
                {isDeleted ? (
                  <span className="message-deleted-text">deleted message</span>
                ) : (
                  <>
                    {hasMedia && renderMedia(msg)}

                    {hasContent && (
                      <div
                        className={hasMedia ? 'message-caption' : undefined}
                      >
                        {linkify(msg.content)}
                      </div>
                    )}

                    {mediaErrors[msg.id] && msg.media_url && (
                      <div className="message-media-error">
                        Media unavailable
                      </div>
                    )}
                  </>
                )}

                <div className="msg-meta">
                  {new Date(msg.created_at).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric',
                    hour12: true,
                  })}
                  {showSeen && <span className="msg-seen"> · Seen</span>}
                </div>

                {!isDeleted && hasContent && (
                  <button
                    type="button"
                    className="message-copy-btn"
                    onClick={() => handleCopy(msg)}
                    title="Copy message"
                    aria-label="Copy message"
                  >
                    {copiedId === msg.id ? '✓' : '⎘'}
                  </button>
                )}

                {isOwn && !isDeleted && onDeleteMessage && (
                  <button
                    type="button"
                    className="message-delete-btn"
                    onClick={() => onDeleteMessage(msg)}
                    title="Delete message"
                    aria-label="Delete message"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}