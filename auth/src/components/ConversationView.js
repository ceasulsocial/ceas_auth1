import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import MessagesList from './MessagesList';
import MessageInput from './MessageInput';

export default function ConversationView({ conversation, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversation) return;
    setLoading(true);
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation', conversation.id)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      setLoading(false);
    };
    fetchMessages();
    // Real-time subscription
    const channel = supabase
      .channel('messages_' + conversation.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation=eq.${conversation.id}` }, payload => {
        fetchMessages();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation]);

  const handleSend = async (content) => {
    await supabase.from('messages').insert({
      conversation: conversation.id,
      sender_id: currentUserId,
      content,
      read_user1: currentUserId === conversation.user1_id,
      read_user2: currentUserId === conversation.user2_id,
    });
    // Real-time will update
  };

  if (!conversation) return <div>Select a conversation</div>;
  if (loading) return <div>Loading messages...</div>;

  return (
    <div>
      <MessagesList messages={messages} currentUserId={currentUserId} />
      <MessageInput onSend={handleSend} />
    </div>
  );
}
