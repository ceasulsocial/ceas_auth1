function ConversationItem({ conversation, currentUserId }) {
  const otherUserId = conversation.user1_id === currentUserId ? conversation.user2_id : conversation.user1_id;

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 5, padding: 10, marginBottom: 10 }}>
      <strong>Conversation with: {otherUserId}</strong>
      <p>Last message: {conversation.last_message}</p>
      <small>Last updated: {new Date(conversation.updated_at).toLocaleString()}</small>
    </div>
  );
}

export default ConversationItem;