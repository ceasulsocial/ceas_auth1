// src/hooks/useMessageSender.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { validateMediaFile } from '../utils/mediaValidation';

export function useMessageSender({
  conversationId,
  currentUserId,
  onMessageSent,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

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

  const send = useCallback(
    async ({ text = '', attachment = null }) => {
      if (submittingRef.current || uploading) return;

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

      submittingRef.current = true;
      cancelledRef.current = false;
      setError(null);

      try {
        // ── Text only ──
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

          if (mountedRef.current && data) {
            onMessageSent?.(data);
          }
          return;
        }

        // ── Media (with or without caption) ──
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
          return;
        }

        // ✅ null content when no caption — SQL trigger fills in fallback
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

        if (mountedRef.current && data) {
          setProgress(100);
          onMessageSent?.(data);
        }
      } catch (err) {
        console.error('Send error:', err);
        if (mountedRef.current) {
          setError(err.message || 'Failed to send message');
        }
      } finally {
        if (mountedRef.current) {
          setUploading(false);
        }
        submittingRef.current = false;
      }
    },
    [conversationId, currentUserId, uploading, onMessageSent, uploadFile]
  );

  return { send, cancel, reset, uploading, error, progress };
}