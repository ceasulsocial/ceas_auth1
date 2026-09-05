import { useState, useRef, useEffect } from 'react';
import './ConversationsList.css'; // Import the CSS

export default function MessageInput({ onSend }) {
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

  // FIX: inconsistent button sizes.
  // This used to set width/padding via inline `style={{}}`, which beats
  // any CSS class due to specificity — so it could never match the
  // sizing used by other buttons in the app (home actions, role
  // options). It now uses the shared .btn-md class from App.css/
  // ConversationsList.css like every other action button.
  return (
    <form onSubmit={handleSubmit} className="message-input-form">
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
        className="btn-md message-input-send"
      >
        Send
      </button>
    </form>
  );
}