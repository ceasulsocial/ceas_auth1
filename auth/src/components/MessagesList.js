import { useEffect, useRef } from 'react';

export default function MessagesList({ messages, currentUserId }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  return (
    <div style={{ maxHeight: 400, overflowY: 'auto', padding: 10, background: '#23272a', borderRadius: 8 }}>
      {messages.map(msg => (
        <div
          key={msg.id}
          style={{
            background: msg.sender_id === currentUserId ? '#00bcd4' : '#181a1b',
            color: msg.sender_id === currentUserId ? '#181a1b' : '#fff',
            alignSelf: msg.sender_id === currentUserId ? 'flex-end' : 'flex-start',
            margin: '8px 0',
            padding: '8px 14px',
            borderRadius: 12,
            maxWidth: '70%',
            fontSize: 16,
          }}
        >
          {msg.content}
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 4, textAlign: 'right' }}>
            {new Date(msg.created_at).toLocaleTimeString()}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
