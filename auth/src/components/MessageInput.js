import { useState, useRef, useEffect } from 'react';
import MediaUpload from './MediaUpload';
import './ConversationsList.css';

export default function MessageInput({ onSend, conversationId, currentUserId, onMediaUpload }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onSend(value);
      setValue('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // ✅ This is the onMediaUpload function
  const handleMediaUpload = () => {
    console.log('📤 Media upload complete, refreshing messages...');
    if (onMediaUpload) {
      // Call multiple times with delays to ensure it triggers
      setTimeout(onMediaUpload, 100);
      setTimeout(onMediaUpload, 500);
      setTimeout(onMediaUpload, 1000);
    } else {
      console.warn('⚠️ onMediaUpload prop is not defined');
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <MediaUpload
          conversationId={conversationId}
          currentUserId={currentUserId}
          onUploadComplete={handleMediaUpload}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={styles.input}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          style={{
            ...styles.sendButton,
            background: value.trim() ? '#00bcd4' : '#40444b',
            color: value.trim() ? '#181a1b' : '#72767d',
            cursor: value.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
  },
  form: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: '#40444b',
    borderRadius: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '16px',
    outline: 'none',
    minHeight: '48px',
  },
  sendButton: {
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontWeight: '600',
    fontSize: '16px',
    transition: 'all 0.2s',
    minWidth: '70px',
  },
};