import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

export default function MediaUpload({ conversationId, currentUserId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [mediaType, setMediaType] = useState(null);

  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  const getUserId = async () => {
    if (currentUserId) return currentUserId;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) return user.id;
    } catch (err) {
      console.error('Auth fallback failed:', err);
    }
    return null;
  };

  const handleFileChange = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    const userId = await getUserId();
    if (!userId) {
      setError('You must be logged in to upload media');
      return;
    }

    if (!conversationId) {
      setError('No conversation selected. Please refresh and try again.');
      return;
    }

    if (type === 'video' && !file.type.startsWith('video/')) {
      setError('Please select a video file');
      return;
    }
    if (type === 'audio' && !file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`File must be under 25MB (current: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }

    setMediaType(type);
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const fileExtension = file.name.split('.').pop();
      const filePath = `${userId}/${Date.now()}_${type}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const mediaTypeLabel = type === 'video' ? 'Video' : 'Audio';
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      const content = `${mediaTypeLabel}: ${fileName}`;

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation: conversationId,
          sender_id: userId,
          content: content,
          media_url: publicUrl,
          media_type: type,
          media_name: file.name,
          created_at: new Date().toISOString(),
          read_user1: false,
          read_user2: false,
        });

      if (messageError) throw messageError;

      if (type === 'video' && videoInputRef.current) {
        videoInputRef.current.value = '';
      }
      if (type === 'audio' && audioInputRef.current) {
        audioInputRef.current.value = '';
      }

      setProgress(100);
      setShowMenu(false);

      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="media-upload">
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileChange(e, 'video')}
        disabled={uploading}
        className="media-upload-input"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => handleFileChange(e, 'audio')}
        disabled={uploading}
        className="media-upload-input"
      />

      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        disabled={uploading}
        className="media-upload-button"
        title="Upload media (video/audio)"
      >
        +
      </button>

      {showMenu && !uploading && (
        <div className="media-upload-menu">
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="media-upload-menu-item"
          >
            <span>Upload Video</span>
          </button>
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="media-upload-menu-item"
          >
            <span>Upload Audio</span>
          </button>
        </div>
      )}

      {uploading && (
        <div className="media-upload-progress">
          <div className="media-upload-progress-bar" style={{ width: `${progress}%` }} />
          <span className="media-upload-progress-text">{progress}%</span>
          <span className="media-upload-progress-label">Uploading {mediaType}...</span>
        </div>
      )}

      {error && <div className="media-upload-error">{error}</div>}
    </div>
  );
}