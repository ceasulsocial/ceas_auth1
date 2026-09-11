// src/utils/mediaValidation.js

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];

export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
];

export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov'];
export const ALLOWED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'webm'];

function getExtension(filename) {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function validateMediaFile(file, type) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const ext = getExtension(file.name);

  if (type === 'video') {
    const mimeOk = file.type.startsWith('video/');
    const extOk = ALLOWED_VIDEO_EXTENSIONS.includes(ext);
    if (!mimeOk || !extOk) {
      return {
        valid: false,
        error: `Unsupported video format. Use: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`,
      };
    }
  } else if (type === 'audio') {
    const mimeOk = file.type.startsWith('audio/');
    const extOk = ALLOWED_AUDIO_EXTENSIONS.includes(ext);
    if (!mimeOk || !extOk) {
      return {
        valid: false,
        error: `Unsupported audio format. Use: ${ALLOWED_AUDIO_EXTENSIONS.join(', ')}`,
      };
    }
  } else {
    return { valid: false, error: `Unknown media type: ${type}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File must be under 25MB (current: ${formatFileSize(file.size)})`,
    };
  }

  return { valid: true };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}