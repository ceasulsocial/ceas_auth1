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
      .select('id, full_name')
      .eq('role', 'trainer')
      .then((res) => {
        const { data, error } = res;
        if (error) {
          console.error('Error fetching trainers:', error);
        } else {
          const filtered = (data || []).filter(trainer => trainer.id !== user?.id);
          setTrainers(filtered);
        }
      });
  }, [user?.id]);

  const startConversation = async (trainerId) => {
    if (!user) return;

    // Takes the oldest matching conversation deterministically (rather
    // than .maybeSingle(), which errors if more than one row matches)
    // so a duplicate row in existing data can't cause a new one to be
    // created on every click.
    let convId = null;
    const { data: existingRows, error: existingError } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(user1_id.eq.${user.id},user2_id.eq.${trainerId}),and(user1_id.eq.${trainerId},user2_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existingError) {
      console.error('Error checking for existing conversation:', existingError);
    }

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing && existing.id) {
      convId = existing.id;
    } else {
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
    <div className="trainer-list">
      <h3>Available Trainers</h3>
      {trainers.map(trainer => (
        <div key={trainer.id} className="trainer-list-item">
          <span className="trainer-name">{trainer.full_name}</span>
          <button onClick={() => startConversation(trainer.id)} className="btn-sm">
            Chat
          </button>
        </div>
      ))}
    </div>
  );
}

export default TrainerList;