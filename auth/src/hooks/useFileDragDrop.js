// src/hooks/useFileDragDrop.js
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * HTML5 drag-and-drop for video/audio files onto a drop target.
 *
 * Uses a counter ref because dragenter/dragleave fire on every nested
 * child as you drag over them; a naive boolean flag flickers on/off.
 */
export function useFileDragDrop({ onFile }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  // Latest-ref so handleDrop always calls the current onFile.
  const onFileRef = useRef(onFile);

  useEffect(() => {
    onFileRef.current = onFile;
  }, [onFile]);

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    let type = null;
    if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';
    else return;

    onFileRef.current?.(file, type);
  }, []);

  return { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop };
}