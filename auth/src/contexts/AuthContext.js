import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // fallback: use last selected role from localStorage while loading
  const fallbackProfile = !profile && !loading && user
    ? { full_name: user.user_metadata?.full_name || '', role: localStorage.getItem('selectedRole') || '' }
    : profile;

  // FIX: runaway request loop (thousands of repeated GET /profiles calls).
  // useCallback with no dependency array never memoizes — it returns a
  // brand-new function every render. Since that new function was in the
  // effect's dependency array below, the effect saw a "change" on every
  // single render, called setProfile, triggered a re-render, created
  // another new function, and fired again — forever. Giving this a real
  // dependency array breaks that cycle.
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    setProfile(data);
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);

      // FIX: messages not updating live.
      // Supabase's Realtime websocket does not automatically inherit
      // the session JWT. Without this, RLS policies evaluate
      // auth.uid() as null during the realtime authorization check,
      // so postgres_changes events (new/updated messages) get silently
      // dropped for every user — even though normal REST queries (like
      // what runs on a page refresh) work fine, since those carry the
      // token correctly on their own.
      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      // Re-sync every time the session changes (sign in, sign out,
      // token refresh) so Realtime never ends up holding a stale or
      // missing token.
      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) refreshProfile();
  }, [refreshProfile, user]);

  const value = {
    user,
    profile: fallbackProfile,
    loading,
    refreshProfile,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);