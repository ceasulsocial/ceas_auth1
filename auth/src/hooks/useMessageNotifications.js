// src/hooks/useMessageNotifications.js
import { useRef, useCallback, useEffect } from 'react';

/**
 * Browser notifications for incoming messages when the tab is hidden.
 *
 * Permission is requested once on mount, and again on the first user
 * gesture (Safari requires a gesture and silently no-ops otherwise).
 */
export function useMessageNotifications({ currentUserId }) {
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    Notification.requestPermission().catch(() => {});
  }, []);

  const requestOnGesture = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const notify = useCallback(
    (message) => {
      if (!message) return;
      if (message.sender_id === currentUserId) return;
      if (!document.hidden) return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      let body;
      if (message.content && message.content.trim().length > 0) {
        body =
          message.content.length > 80
            ? `${message.content.slice(0, 80)}…`
            : message.content;
      } else if (message.media_type === 'video') {
        body = '📹 Sent a video';
      } else if (message.media_type === 'audio') {
        body = '🎵 Sent an audio file';
      } else {
        body = 'New message';
      }

      try {
        const n = new Notification('Ceasul Social', {
          body,
          icon: '/favicon.ico',
          tag: `conversation-${message.conversation}`,
          renotify: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch (err) {
        console.error('Notification error:', err);
      }
    },
    [currentUserId]
  );

  return { notify, requestOnGesture };
}