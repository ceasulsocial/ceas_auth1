// src/components/ConversationView.js
import { useRef } from 'react';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';
import { useMessageSender } from '../hooks/useMessageSender';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { useMessagePagination } from '../hooks/useMessagePagination';
import { useMessageScroll } from '../hooks/useMessageScroll';
import { useReadReceipts } from '../hooks/useReadReceipts';
import { useUnreadReset } from '../hooks/useUnreadReset';
import { useMessageNotifications } from '../hooks/useMessageNotifications';
import { useFileDragDrop } from '../hooks/useFileDragDrop';
import { useDeleteMessage } from '../hooks/useDeleteMessage';
import './ConversationsList.css';

export default function ConversationView({
  conversation,
  currentUserId,
  onMessageSent: onMessageSentProp,
  notifyTyping,
  clearTypingFor,
  isOtherTyping,
}) {
  // ── Derived primitives (stable for effect deps) ──
  const conversationId = conversation?.id;
  const user1Id = conversation?.user1_id;
  const isUser1 = currentUserId === user1Id;
  const myUnreadColumn = isUser1 ? 'unread_count_user1' : 'unread_count_user2';
  const myReadColumn = isUser1 ? 'read_user1' : 'read_user2';
  const currentUnread = conversation?.[myUnreadColumn] || 0;

  // ── Refs shared between hooks ──
  const messagesListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);

  // ── Notifications ──
  const { notify, requestOnGesture } = useMessageNotifications({
    currentUserId,
  });

  // ── 1. Messages + realtime ──
  //    onInsert → inform scroll + notify + clear typing
  //    (These are wired up below, after the scroll hook exists.)
  //
  //    We use a ref-indirection for the INSERT callback because
  //    the messages hook runs BEFORE the scroll hook in source order.
  //    The messages hook manages its own internal ref, so this outer
  //    ref-indirection just lets us forward to the scroll hook.
  const insertForwardRef = useRef(null);

  const {
    messages,
    setMessages,
    loading,
    error,
    setError,
    PAGE_SIZE,
  } = useConversationMessages({
    conversationId,
    onInsert: (msg) => insertForwardRef.current?.(msg),
    onUpdate: () => {},
    onDelete: () => {},
  });

  // ── 2. Pagination ──
  //    hasMoreOlder lives here so ConversationView owns it and can
  //    reset it on conversation change.
  const hasMoreOlderRef = useRef(true);
  const setHasMoreOlder = (v) => {
    hasMoreOlderRef.current = v;
  };

  // We need beginPrepend/endPrepend from the scroll hook, but the
  // pagination hook needs them too. So: declare pagination hook last,
  // and pass scroll's prepend methods into it.
  //
  // But scroll also needs loadOlder for its scroll listener. Circular.
  //
  // Solution: use a ref for loadOlder that the scroll hook calls, and
  // wire the ref after both hooks are created.
  const loadOlderRef = useRef(null);

  // ── 3. Scroll ──
  const {
    showScrollButton,
    unreadWhileScrolledUp,
    newMessageDividerId,
    handleMediaLoad,
    handleScroll,
    handleScrollToBottom,
    handleIncoming,
    handleOwnSend,
    beginPrepend,
    endPrepend,
  } = useMessageScroll({
    messages,
    conversationId,
    messagesListRef,
    messagesEndRef,
    loadOlder: () => loadOlderRef.current?.(),
    currentUserId,
  });

  // Wire the insert forwarder now that handleIncoming exists.
  insertForwardRef.current = (msg) => {
    handleIncoming(msg);
    notify(msg);
    if (clearTypingFor) clearTypingFor(conversationId);
  };

  // ── 4. Pagination (now that scroll hook exists) ──
  const { loadOlder, loadingOlder } = useMessagePagination({
    conversationId,
    messages,
    setMessages,
    hasMoreOlder: hasMoreOlderRef.current,
    setHasMoreOlder,
    messagesListRef,
    onBeforePrepend: beginPrepend,
    onAfterPrepend: endPrepend,
    PAGE_SIZE,
  });

  // Wire the ref the scroll hook uses.
  loadOlderRef.current = loadOlder;

  // ── 5. Read receipts ──
  useReadReceipts({
    conversationId,
    currentUserId,
    messages,
    myReadColumn,
  });

  // ── 6. Unread reset ──
  useUnreadReset({
    conversationId,
    currentUnread,
    myUnreadColumn,
    messages,
  });

  // ── 7. Delete ──
  const { deleteMessage } = useDeleteMessage({
    conversationId,
    currentUserId,
    setMessages,
    setError,
  });

  // ── 8. Send ──
  const {
    send,
    cancel,
    uploading,
    error: sendError,
    progress,
    pendingMessages,
    retry: retryMessage,
    dismiss: dismissMessage,
  } = useMessageSender({
    conversationId,
    currentUserId,
    onMessageSent: (msg) => {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      onMessageSentProp?.(msg);
      handleOwnSend();
      requestOnGesture();
    },
  });

  // ── 9. Drag-and-drop ──
  const { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop } =
    useFileDragDrop({
      onFile: (file, type) => messageInputRef.current?.addFile(file, type),
    });

  // ── 10. Typing forwarder ──
  const sendTyping = () => {
    if (notifyTyping && conversationId) notifyTyping(conversationId);
  };

  // ── Render ──
  if (!conversation) {
    return (
      <div className="no-conversation">
        <p>Select a conversation to start messaging</p>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading messages...</div>;
  }

  const allMessages = [...messages, ...pendingMessages];

  return (
    <>
      <div className="messages-header">
        <h3>Chat</h3>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div
        className={`messages-list ${isDragging ? 'messages-list--dragging' : ''}`}
        ref={messagesListRef}
        onScroll={handleScroll}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              <div className="drop-overlay-icon">📎</div>
              <div className="drop-overlay-text">Drop video or audio here</div>
            </div>
          </div>
        )}

        {loadingOlder && (
          <div className="messages-loading-older">
            <div className="attachment-progress-spinner" />
            <span>Loading older messages...</span>
          </div>
        )}

        {!hasMoreOlderRef.current && messages.length > 0 && (
          <div className="messages-no-more">
            — Beginning of conversation —
          </div>
        )}

        {allMessages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello.</div>
        ) : (
          <MessagesList
            messages={allMessages}
            currentUserId={currentUserId}
            conversation={conversation}
            onMediaLoad={handleMediaLoad}
            onDeleteMessage={deleteMessage}
            onRetryMessage={retryMessage}
            onDismissMessage={dismissMessage}
            newMessageDividerId={newMessageDividerId}
          />
        )}
        <div ref={messagesEndRef} />

        {showScrollButton && (
          <button
            type="button"
            className={`scroll-to-bottom-btn ${
              unreadWhileScrolledUp > 0 ? 'scroll-to-bottom-btn--unread' : ''
            }`}
            onClick={handleScrollToBottom}
            aria-label="Scroll to latest messages"
            title="Scroll to latest"
          >
            ↓
            {unreadWhileScrolledUp > 0 && (
              <span className="scroll-to-bottom-badge">
                {unreadWhileScrolledUp > 9 ? '9+' : unreadWhileScrolledUp}
              </span>
            )}
          </button>
        )}
      </div>

      {isOtherTyping && (
        <div className="typing-indicator">
          <span className="typing-dots">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          <span className="typing-text">typing...</span>
        </div>
      )}

      <div className="send-message-form">
        <MessageInput
          ref={messageInputRef}
          onSubmit={send}
          onCancel={cancel}
          uploading={uploading}
          error={sendError}
          progress={progress}
          onTyping={sendTyping}
        />
      </div>
    </>
  );
}