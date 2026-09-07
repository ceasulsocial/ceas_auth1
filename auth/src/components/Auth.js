import React from 'react';
import { supabase } from '../supabaseClient';

export function Auth() {
  const clickHandle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: { prompt: 'select_account' },
        redirectTo: window.location.origin
      }
    });
  };

  return (
    <div className="auth-container">
      <h2>Welcome</h2>
      <button className="login-btn" onClick={clickHandle}>
        Log in with Google
      </button>
    </div>
  );
}