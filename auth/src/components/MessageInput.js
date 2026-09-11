// src/components/MessageInput.js
import { useState, useRef, useEffect, useCallback } from 'react';
import MediaUpload from './MediaUpload';
import AttachmentPreview from './AttachmentPreview';
import { validateMediaFile } from '../utils/mediaValidation';
import './ConversationsList.css';

export default function MessageInput({
  onSubmit,
  onCancel,
  uploading,
  error: externalError,
  progress,
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [localError, setLocalError] = useState(null);
  const inputRef = useRef(null);

  const error = externalError || localError;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clearError = useCallback(() => {
    setLocalError(null);
  }, []);

  const handleFileSelected = useCallback(
    (file, type) => {
      clearError();
      const validation = validateMediaFile(file, type);
      if (!validation.valid) {
        setLocalError(validation.error);
        return;
      }
      setAttachment({ file, type });
      inputRef.current?.focus();
    },
    [clearError]
  );

  const handleRemoveAttachment = useCallback(() => {
    setAttachment(null);
    clearError();
    inputRef.current?.focus();
  }, [clearError]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();

      const hasText = text.trim().length > 0;
      const hasAttachment = !!attachment;

      if (!hasText && !hasAttachment) return;
      if (uploading) return;

      onSubmit({ text, attachment });
      setText('');
      setAttachment(null);
    },
    [text, attachment, uploading, onSubmit]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && attachment && !uploading) {
        e.preventDefault();
        handleRemoveAttachment();
      }
    },
    [attachment, uploading, handleRemoveAttachment]
  );

  const canSend = (text.trim().length > 0 || !!attachment) && !uploading;

  return (
    <div className="message-input-bar">
      {attachment && (
        <AttachmentPreview
          file={attachment.file}
          type={attachment.type}
          onRemove={handleRemoveAttachment}
          disabled={uploading}
        />
      )}

      {uploading && (
        <div className="attachment-progress">
          <div className="attachment-progress-spinner" />
          <span className="attachment-progress-text">
            Uploading {attachment?.type || 'file'}… {progress}%
          </span>
          <button
            type="button"
            className="attachment-cancel"
            onClick={onCancel}
            aria-label="Cancel upload"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="attachment-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="message-input-form">
        <MediaUpload
          onFileSelected={handleFileSelected}
          disabled={uploading || !!attachment}
        />

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (localError) clearError();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            attachment ? 'Add a caption (optional)…' : 'Type a message…'
          }
          className="message-input-field"
          disabled={false}
          aria-label="Message text"
          autoComplete="off"
        />

        <button
          type="submit"
          disabled={!canSend}
          className="message-input-send"
        >
          {uploading ? 'Uploading…' : 'Send'}
        </button>
      </form>
    </div>
  );
}