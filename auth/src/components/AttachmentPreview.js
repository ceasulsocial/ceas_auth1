// src/components/AttachmentPreview.js
import { useEffect, useState } from 'react';
import { formatFileSize } from '../utils/mediaValidation';

export default function AttachmentPreview({ file, type, onRemove, disabled }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!previewUrl) return null;

  return (
    <div className="attachment-preview">
      <button
        type="button"
        className="attachment-remove"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove attachment"
        title="Remove attachment"
      >
        ×
      </button>

      {type === 'video' && (
        <video
          src={previewUrl}
          controls
          className="attachment-preview-video"
          preload="metadata"
        />
      )}

      {type === 'audio' && (
        <div className="attachment-preview-audio">
          <span className="attachment-preview-icon" aria-hidden="true">
            🎵
          </span>
          <audio
            src={previewUrl}
            controls
            className="attachment-preview-audio-player"
          />
        </div>
      )}

      <div className="attachment-preview-name" title={file.name}>
        <span className="attachment-preview-name-text">{file.name}</span>
        <span className="attachment-preview-size">
          {formatFileSize(file.size)}
        </span>
      </div>
    </div>
  );
}