import { useEffect, useRef } from 'react';
import './ConversationsList.css'; // Import the CSS

export default function MessagesList({ messages, currentUserId, conversation }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // FIX: read receipts.
  // Figures out which read_userX column belongs to the OTHER person in
  // this conversation, then finds the last message I sent so the
  // "Seen" indicator only shows once, under the most recent message,
  // matching typical chat-app UX rather than tagging every message.
  const isUser1 = conversation && currentUserId === conversation.user1_id;
  const otherReadColumn = isUser1 ? 'read_user2' : 'read_user1';

  let lastOwnMessageId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_id === currentUserId) {
      lastOwnMessageId = messages[i].id;
      break;
    }
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

        return (
          <div
            key={msg.id}
            className={`message ${isOwn ? 'own' : ''}`}
          >
            {msg.content}
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
        );
      })}
      <div ref={endRef} />
    </>
  );
}