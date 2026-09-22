// src/hooks/useMessageSender.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { validateMediaFile } from '../utils/mediaValidation';

export function useMessageSender({
  conversationId,
  currentUserId,
  onMessageSent,
  onMessageFailed,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  // ✅ New: pending and failed messages
  const [pendingMessages, setPendingMessages] = useState([]);

  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setError(null);
    setProgress(0);
  }, []);

  const uploadFile = useCallback(async (file, type, userId) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const filePath = `${userId}/${Date.now()}_${type}.${fileExtension}`;

    setProgress(30);

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    setProgress(70);

    const {
      data: { publicUrl },
    } = supabase.storage.from('media').getPublicUrl(filePath);

    setProgress(90);
    return publicUrl;
  }, []);

  // Internal: does the actual send for a given payload.
  // Returns { success, data } or { success: false, error }
  const performSend = useCallback(
    async ({ text, attachment }) => {
      const trimmedText = text.trim();

      // Text-only
      if (!attachment) {
        const { data, error: insertError } = await supabase
          .from('messages')
          .insert({
            conversation: conversationId,
            sender_id: currentUserId,
            content: trimmedText,
            created_at: new Date().toISOString(),
            read_user1: false,
            read_user2: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return data;
      }

      // Media
      const validation = validateMediaFile(attachment.file, attachment.type);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      setUploading(true);
      setProgress(10);

      const publicUrl = await uploadFile(
        attachment.file,
        attachment.type,
        currentUserId
      );

      if (cancelledRef.current) {
        const filePath = publicUrl.split('/media/')[1];
        if (filePath) {
          await supabase.storage.from('media').remove([filePath]);
        }
        throw new Error('Upload cancelled');
      }

      const content = trimmedText || null;

      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({
          conversation: conversationId,
          sender_id: currentUserId,
          content,
          media_url: publicUrl,
          media_type: attachment.type,
          media_name: attachment.file.name,
          created_at: new Date().toISOString(),
          read_user1: false,
          read_user2: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    },
    [conversationId, currentUserId, uploadFile]
  );

  /**
   * Send a message with pending/failed state.
   * Returns a promise that resolves when the send completes.
   */
  const send = useCallback(
    async ({ text = '', attachment = null }) => {
      const trimmedText = text.trim();
      if (!trimmedText && !attachment) return;
      if (!currentUserId) {
        setError('You must be logged in to send messages');
        return;
      }
      if (!conversationId) {
        setError('No conversation selected');
        return;
      }

      // ✅ Create a pending message immediately so UI renders instantly
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pendingMessage = {
        id: tempId,
        conversation: conversationId,
        sender_id: currentUserId,
        content: trimmedText || null,
        media_url: null,
        media_type: attachment?.type || null,
        media_name: attachment?.file?.name || null,
        created_at: new Date().toISOString(),
        read_user1: false,
        read_user2: false,
        _pending: true,
        _attachment: attachment, // for retry
        _text: trimmedText,       // for retry
      };

      setPendingMessages((prev) => [...prev, pendingMessage]);
      submittingRef.current = true;
      cancelledRef.current = false;
      setError(null);

      try {
        const data = await performSend({ text: trimmedText, attachment });

        if (mountedRef.current && data) {
          // ✅ Remove pending, notify parent with the real message
          setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
          setProgress(100);
          onMessageSent?.(data);
        }
      } catch (err) {
        console.error('Send error:', err);
        if (mountedRef.current) {
          // ✅ Mark as failed instead of removing
          setPendingMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, _pending: false, _failed: true, _error: err.message }
                : m
            )
          );
          setError(err.message || 'Failed to send message');
          onMessageFailed?.(err);
        }
      } finally {
        if (mountedRef.current) {
          setUploading(false);
        }
        submittingRef.current = false;
      }
    },
    [conversationId, currentUserId, performSend, onMessageSent, onMessageFailed]
  );

  /**
   * Retry a failed message.
   */
  const retry = useCallback(
    async (tempId) => {
      const msg = pendingMessages.find((m) => m.id === tempId);
      if (!msg || !msg._failed) return;

      // Reset to pending
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, _pending: true, _failed: false, _error: null }
            : m
        )
      );

      try {
        const data = await performSend({
          text: msg._text,
          attachment: msg._attachment,
        });

        if (mountedRef.current && data) {
          setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
          onMessageSent?.(data);
        }
      } catch (err) {
        console.error('Retry error:', err);
        if (mountedRef.current) {
          setPendingMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, _pending: false, _failed: true, _error: err.message }
                : m
            )
          );
        }
      }
    },
    [pendingMessages, performSend, onMessageSent]
  );

  /**
   * Dismiss a failed message (remove it).
   */
  const dismiss = useCallback((tempId) => {
    setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  // Clear pending messages when conversation changes
  useEffect(() => {
    setPendingMessages([]);
  }, [conversationId]);

  return {
    send,
    cancel,
    reset,
    retry,
    dismiss,
    uploading,
    error,
    progress,
    pendingMessages,
  };
}