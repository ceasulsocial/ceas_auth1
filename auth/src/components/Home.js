import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import TrainerList from './TrainerList';

export function Home({ user, profile }) {
  const navigate = useNavigate();

  const signOutHandle = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  // for debugging
  const changeRoleHandle = () => {
    console.log("Change Role button clicked");
    navigate('/role');
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h3>Welcome, {profile.full_name}!</h3>
        <p>Your role: {profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : ''}</p>
        <div className="home-actions">
          <button onClick={signOutHandle}>Sign Out</button>
          <button onClick={changeRoleHandle}>Change Role</button>
          <button onClick={() => navigate('/conversations')}>Conversations</button>
        </div>
        <hr />
        <div className={profile.role?.toLowerCase() === 'user' ? 'trainer-list-container' : 'trainer-dashboard-container'}>
          {profile.role?.toLowerCase() === 'user' && <TrainerList />}
          {profile.role?.toLowerCase() === 'trainer' && <div>Trainer dashboard coming soon!</div>}
        </div>
      </div>
    </div>
  );
}