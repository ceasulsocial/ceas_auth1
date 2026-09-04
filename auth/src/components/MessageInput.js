import { useState } from 'react';

export default function MessageInput({ onSend }) {
  const [value, setValue] = useState('');
  return (
    <form
      style={{ display: 'flex', gap: 8, marginTop: 10 }}
      onSubmit={e => {
        e.preventDefault();
        if (value.trim()) {
          onSend(value);
          setValue('');
        }
      }}
    >
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type a message..."
        style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#23272a', color: '#fff', fontSize: 16 }}
        autoFocus
      />
      <button type="submit" style={{ background: '#00bcd4', color: '#181a1b', border: 'none', borderRadius: 8, padding: '0 18px', fontWeight: 'bold', fontSize: 16 }}>
        Send
      </button>
    </form>
  );
}
