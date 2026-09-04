import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

function TrainerList() {
  const [trainers, setTrainers] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name') // Only select fields you are sure exist
      .eq('role', 'trainer')
      .then((res) => {
        console.log('Supabase response:', res);
        const { data, error } = res;
        if (error) {
          console.error('Supabase error fetching trainers:', error);
        } else {
          // Exclude current user from trainers list
          const filtered = (data || []).filter(trainer => trainer.id !== user?.id);
          console.log('Fetched trainers (excluding self):', filtered);
          setTrainers(filtered);
        }
      });
  }, [user?.id]);

  const startConversation = async (trainerId) => {
    if (!user) return;
    // Check if conversation already exists
    let convId = null;
    const { data: existing, error: existingError } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(user1_id.eq.${user.id},user2_id.eq.${trainerId}),and(user1_id.eq.${trainerId},user2_id.eq.${user.id})`)
      .maybeSingle();
    if (existing && existing.id) {
      convId = existing.id;
    } else {
      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from('conversations')
        .insert({ user1_id: user.id, user2_id: trainerId })
        .select()
        .single();
      if (createError) {
        console.error('Error creating conversation:', createError);
      }
      convId = created?.id;
    }
    if (convId) {
      navigate('/conversations', { state: { conversationId: convId } });
    } else {
      alert('Could not start conversation. Check the console for errors.');
    }
  };

  return (
    <div>
      <h3>Available Trainers</h3>
      {trainers.map(trainer => (
        <div key={trainer.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span>{trainer.full_name} ({trainer.id})</span>
          <button onClick={() => startConversation(trainer.id)} style={{ marginLeft: 8 }}>Chat</button>
        </div>
      ))}
    </div>
  );
}

export default TrainerList;