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

  return (
    <div className="message-input-bar">
      <form onSubmit={handleSubmit} className="message-input-form">
        <MediaUpload
          conversationId={conversationId}
          currentUserId={currentUserId}
          onUploadComplete={onMediaUpload}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="message-input-field"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="message-input-send"
        >
          Send
        </button>
      </form>
    </div>
  );
}