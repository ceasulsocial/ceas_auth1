import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import TrainerList from './TrainerList';
import './Home.css';

export function Home({ user, profile }) {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [loadingApp, setLoadingApp] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const fetchApp = async () => {
      const { data, error } = await supabase
        .from('trainer_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error) setApplication(data);
      setLoadingApp(false);
    };
    fetchApp();
  }, [user?.id]);

  const signOutHandle = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const renderMiddleButton = () => {
    if (profile.role === 'trainer') return null;
    if (loadingApp) return null;

    if (application?.status === 'pending') {
      return (
        <button disabled className="home-btn-pending">
          Application pending…
        </button>
      );
    }

    if (application?.status === 'rejected') {
      const rejectionAgeDays = application.reviewed_at
        ? (Date.now() - new Date(application.reviewed_at)) / 86400000
        : Infinity;

      const canReapply = rejectionAgeDays >= 7;
      const daysRemaining = Math.ceil(7 - rejectionAgeDays);

      if (!canReapply) {
        return (
          <button disabled className="home-btn-pending">
            Reapply in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
          </button>
        );
      }

      return (
        <button onClick={() => navigate('/apply-trainer')}>
          Reapply for Trainer
        </button>
      );
    }

    return (
      <button onClick={() => navigate('/apply-trainer')}>
        Apply for Trainer
      </button>
    );
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h3>Welcome, {profile.full_name}!</h3>
        <p>
          Your role:{' '}
          {profile.role
            ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
            : ''}
        </p>

        {application?.status === 'rejected' && application.reviewer_notes && (
          <div className="home-rejection-notice">
            <strong>Your application was declined.</strong>
            <p>{application.reviewer_notes}</p>
          </div>
        )}

        {profile.is_admin && (
          <div className="home-admin-link">
            <button onClick={() => navigate('/admin/applications')}>
              🔧 Review Trainer Applications
            </button>
          </div>
        )}

        <div className="home-actions">
          <button onClick={signOutHandle}>Sign Out</button>
          {renderMiddleButton()}
          <button onClick={() => navigate('/conversations')}>
            Conversations
          </button>
        </div>

        <hr />

        <div
          className={
            profile.role?.toLowerCase() === 'user'
              ? 'trainer-list-container'
              : 'trainer-dashboard-container'
          }
        >
          {profile.role?.toLowerCase() === 'user' && <TrainerList />}
          {profile.role?.toLowerCase() === 'trainer' && (
            <div>Trainer dashboard coming soon!</div>
          )}
        </div>
      </div>
    </div>
  );
}