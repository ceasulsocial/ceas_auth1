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
        const { data, error } = res;
        if (error) {
          console.error('Supabase error fetching trainers:', error);
        } else {
          // Exclude current user from trainers list
          const filtered = (data || []).filter(trainer => trainer.id !== user?.id);
          setTrainers(filtered);
        }
      });
  }, [user?.id]);

  const startConversation = async (trainerId) => {
    if (!user) return;
    // Check if conversation already exists.
    // FIX: this previously used .maybeSingle(), which throws an error
    // if MORE THAN ONE row matches — and that error was never checked,
    // so it was silently treated as "no conversation found," causing a
    // brand new duplicate conversation to be created. Once even one
    // duplicate existed, every future click made it worse. This now
    // takes the oldest matching conversation deterministically, even
    // if duplicates already exist in your data, and logs real errors
    // instead of swallowing them.
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
    <div className="trainer-list">
      <h3>Available Trainers</h3>
      {trainers.map(trainer => (
        <div key={trainer.id} className="trainer-list-item">
          {/* FIX: names showing IDs. This used to render
              `{trainer.full_name} ({trainer.id})`, printing the raw
              UUID right next to the name — almost certainly leftover
              debugging output. Only the name is shown now. */}
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