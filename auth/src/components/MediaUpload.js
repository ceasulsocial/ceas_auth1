// src/components/MediaUpload.js
import { useState, useRef, useEffect } from 'react';

export default function MediaUpload({ onFileSelected, disabled }) {
  const [showMenu, setShowMenu] = useState(false);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowMenu(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showMenu]);

  const handleFileChange = (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    onFileSelected(file, type);
    setShowMenu(false);
    event.target.value = '';
  };

  return (
    <div className="media-upload" ref={menuRef}>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/quicktime"
        onChange={(e) => handleFileChange(e, 'video')}
        disabled={disabled}
        className="media-upload-input"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm"
        onChange={(e) => handleFileChange(e, 'audio')}
        disabled={disabled}
        className="media-upload-input"
      />

      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        disabled={disabled}
        className="media-upload-button"
        title="Attach media"
        aria-label="Attach media"
        aria-haspopup="menu"
        aria-expanded={showMenu}
      >
        +
      </button>

      {showMenu && !disabled && (
        <div className="media-upload-menu" role="menu">
          <button
            type="button"
            onClick={() => {
              videoInputRef.current?.click();
              setShowMenu(false);
            }}
            className="media-upload-menu-item"
            role="menuitem"
          >
            <span aria-hidden="true">🎬</span>
            <span>Upload Video</span>
          </button>
          <button
            type="button"
            onClick={() => {
              audioInputRef.current?.click();
              setShowMenu(false);
            }}
            className="media-upload-menu-item"
            role="menuitem"
          >
            <span aria-hidden="true">🎵</span>
            <span>Upload Audio</span>
          </button>
        </div>
      )}
    </div>
  );
}