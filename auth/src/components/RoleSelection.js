import { supabase } from '../supabaseClient';
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function RoleSelection() {
  const { user, refreshProfile } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('selectedRole') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();


  // Persist role selection in localStorage and always sync state
  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    localStorage.setItem('selectedRole', selectedRole);
  };

  // Always initialize from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('selectedRole');
    if (saved) setRole(saved);
  }, []);

  const handleSubmit = async () => {
    if (!role || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { error: supabaseError } = await supabase
        .from('profiles')
        .upsert(
          { 
            id: user.id, 
            role,
            full_name: user.user_metadata?.full_name || ''
          }, 
          { onConflict: 'id' }
        );
      if (supabaseError) throw supabaseError;
      await refreshProfile();
      localStorage.removeItem('selectedRole'); // clear after submit
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Role update failed:', err);
      setError(err.message || 'Failed to save role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="role-selection">
      <h2 className="role-title">Select Your Role</h2>
      <p className="role-subtitle">Choose how you'll use the platform</p>
      <div className="role-options">
        <button 
          onClick={() => handleRoleSelect('user')} 
          className={`role-option user${role === 'user' ? ' active' : ''}`}
          disabled={loading}
        >
          <span className="role-icon"></span>
          <span className="role-label">User</span>
          <p className="role-description">Browse trainers and book sessions</p>
        </button>
        <button 
          onClick={() => handleRoleSelect('trainer')} 
          className={`role-option trainer${role === 'trainer' ? ' active' : ''}`}
          disabled={loading}
        >
          <span className="role-icon"></span>
          <span className="role-label">Trainer</span>
          <p className="role-description">Manage clients and schedule</p>
        </button>
      </div>
      <div className="role-action">
        <button 
          onClick={handleSubmit} 
          disabled={!role || loading}
          className="submit-btn"
        >
          {loading ? (
            <>
              <span className="spinner"></span> Saving...
            </>
          ) : 'Continue'}
        </button>
      </div>
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}