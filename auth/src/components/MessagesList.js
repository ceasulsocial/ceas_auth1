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
  onRetryMessage,
  onDismissMessage,
  newMessageDividerId,
}) {
  const [mediaErrors, setMediaErrors] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const isUser1 = conversation && currentUserId === conversation.user1_id;
  const otherReadColumn = isUser1 ? 'read_user2' : 'read_user1';

  // Last NON-DELETED, non-pending own message (for "Seen")
  let lastOwnMessageId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      m.sender_id === currentUserId &&
      !m.deleted_at &&
      !m._pending &&
      !m._failed
    ) {
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
    if (msg._pending && msg._attachment) {
      // Pending media — show local preview
      const file = msg._attachment.file;
      const url = URL.createObjectURL(file);
      return (
        <div className="message-media">
          {msg._attachment.type === 'video' ? (
            <video controls src={url} className="message-media-preview" />
          ) : (
            <div className="message-audio">
              <span className="message-audio-icon">🎵</span>
              <audio controls src={url} />
            </div>
          )}
        </div>
      );
    }

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
        const isPending = !!msg._pending;
        const isFailed = !!msg._failed;

        const showSeen =
          !isDeleted &&
          !isPending &&
          !isFailed &&
          isOwn &&
          conversation &&
          msg.id === lastOwnMessageId &&
          msg[otherReadColumn];

        const hasMedia =
          !isDeleted &&
          (isPending
            ? !!msg._attachment
            : msg.media_url && !mediaErrors[msg.id]);

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

            <div className={`message-wrapper ${isOwn ? 'own' : 'other'}`}>
              <div
                className={`message ${isOwn ? 'own' : ''} ${
                  isDeleted ? 'message--deleted' : ''
                } ${isPending ? 'message--pending' : ''} ${
                  isFailed ? 'message--failed' : ''
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

                  {isPending && (
                    <span className="msg-status msg-status--pending" title="Sending">
                      {' '}· ⟳
                    </span>
                  )}

                  {isFailed && (
                    <span className="msg-status msg-status--failed" title="Failed to send">
                      {' '}· ⚠
                    </span>
                  )}
                </div>

                {/* Copy button — hide for pending/failed */}
                {!isDeleted && !isPending && !isFailed && hasContent && (
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

                {/* Delete — hide for pending/failed */}
                {isOwn && !isDeleted && !isPending && !isFailed && onDeleteMessage && (
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

                {/* Retry + dismiss for failed messages */}
                {isFailed && (
                  <div className="message-failed-actions">
                    <button
                      type="button"
                      className="message-retry-btn"
                      onClick={() => onRetryMessage?.(msg.id)}
                      title="Retry"
                      aria-label="Retry sending"
                    >
                      ↻ Retry
                    </button>
                    <button
                      type="button"
                      className="message-dismiss-btn"
                      onClick={() => onDismissMessage?.(msg.id)}
                      title="Dismiss"
                      aria-label="Dismiss failed message"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}