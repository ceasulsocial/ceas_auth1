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

  // ✅ Helper to get user ID (with fallback to auth)
  const getUserId = async () => {
    if (currentUserId) return currentUserId;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        console.log('✅ Got user from auth fallback:', user.id);
        return user.id;
      }
    } catch (err) {
      console.error('Auth fallback failed:', err);
    }
    return null;
  };

  // ✅ Helper to get conversation ID (try multiple sources)
  const getConversationId = () => {
    if (conversationId) return conversationId;
    
    // Try to get from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const urlConvId = urlParams.get('conversation');
    if (urlConvId) return urlConvId;
    
    // Try to get from localStorage
    const savedConvId = localStorage.getItem('currentConversationId');
    if (savedConvId) return savedConvId;
    
    // Try to get from sessionStorage
    const sessionConvId = sessionStorage.getItem('currentConversationId');
    if (sessionConvId) return sessionConvId;
    
    return null;
  };

  const handleFileChange = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    // ✅ Get user ID (with fallback)
    const userId = await getUserId();
    
    if (!userId) {
      setError('You must be logged in to upload media');
      return;
    }

    // ✅ Get conversation ID (with fallback)
    const convId = getConversationId();
    
    if (!convId) {
      setError('No conversation selected. Please refresh and try again.');
      return;
    }

    console.log('📌 Uploading with:', { userId, convId });

    // Validate file type
    if (type === 'video' && !file.type.startsWith('video/')) {
      setError('Please select a video file');
      return;
    }
    if (type === 'audio' && !file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }

    // Validate file size
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

      console.log('📤 Uploading to:', filePath);

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('✅ Upload successful:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      console.log('🔗 Public URL:', publicUrl);

      // Determine message content
      const mediaTypeLabel = type === 'video' ? '📹 Video' : '🎵 Audio';
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      const content = `${mediaTypeLabel}: ${fileName}`;

      // Save to messages table
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation: convId,
          sender_id: userId,
          content: content,
          media_url: publicUrl,
          media_type: type,
          media_name: file.name,
          created_at: new Date().toISOString(),
          read_user1: false,
          read_user2: false,
        });

      if (messageError) {
        console.error('Message insert error:', messageError);
        throw messageError;
      }

      console.log('✅ Message saved to database');

      // Reset input
      if (type === 'video' && videoInputRef.current) {
        videoInputRef.current.value = '';
      }
      if (type === 'audio' && audioInputRef.current) {
        audioInputRef.current.value = '';
      }
      
      setProgress(100);
      setShowMenu(false);

      // Notify parent
      if (onUploadComplete) {
        setTimeout(onUploadComplete, 300);
        setTimeout(onUploadComplete, 600);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.container}>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileChange(e, 'video')}
        disabled={uploading}
        style={styles.fileInput}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => handleFileChange(e, 'audio')}
        disabled={uploading}
        style={styles.fileInput}
      />

      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={uploading}
        style={styles.uploadButton}
        title="Upload media (video/audio)"
      >
        📎
      </button>

      {showMenu && !uploading && (
        <div style={styles.menu}>
          <button
            onClick={() => videoInputRef.current?.click()}
            style={styles.menuItem}
          >
            <span style={styles.menuIcon}>🎬</span>
            <span>Upload Video</span>
          </button>
          <button
            onClick={() => audioInputRef.current?.click()}
            style={styles.menuItem}
          >
            <span style={styles.menuIcon}>🎵</span>
            <span>Upload Audio</span>
          </button>
        </div>
      )}

      {uploading && (
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
          <span style={styles.progressText}>{progress}%</span>
          <span style={styles.progressLabel}>
            Uploading {mediaType}...
          </span>
        </div>
      )}

      {error && <div style={styles.error}>⚠️ {error}</div>}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fileInput: {
    display: 'none',
  },
  uploadButton: {
    background: 'transparent',
    border: 'none',
    color: '#b9bbbe',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  menu: {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    marginBottom: '8px',
    background: '#2f3136',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    padding: '6px',
    minWidth: '180px',
    zIndex: 1000,
    border: '1px solid #40444b',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    color: '#dcddde',
    width: '100%',
    textAlign: 'left',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  menuIcon: {
    fontSize: '18px',
  },
  progressContainer: {
    position: 'relative',
    height: '20px',
    backgroundColor: '#2c2f33',
    borderRadius: '10px',
    overflow: 'hidden',
    minWidth: '120px',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00bcd4',
    transition: 'width 0.3s',
  },
  progressText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  progressLabel: {
    position: 'absolute',
    top: '50%',
    right: '8px',
    transform: 'translateY(-50%)',
    color: '#b9bbbe',
    fontSize: '10px',
  },
  error: {
    color: '#ed4245',
    fontSize: '13px',
    padding: '4px 8px',
    backgroundColor: 'rgba(237, 66, 69, 0.1)',
    borderRadius: '4px',
  },
};