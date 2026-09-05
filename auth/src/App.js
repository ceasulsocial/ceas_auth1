import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { RoleSelection } from './components/RoleSelection';
import { Home } from './components/Home';
import { LoadingScreen } from './components/LoadingScreen';
import ConversationsList from './components/ConversationsList';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleSelectionRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return <RoleSelection />;
}

function AppContent() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // FIX: CSS too thin.
  // The chat UI was being squeezed into the same 520px-max-width
  // container used for the auth/home screens. The chat route now gets
  // its own wide layout via the app-container--wide / app-content--chat
  // modifier classes (see App.css), instead of reusing the narrow one.
  const isChatRoute = location.pathname.startsWith('/conversations');

  if (loading) {
    return (
      <div className="app">
        <div className="app-container">
          <div className="app-header">
            <h1>Ceasul Social</h1>
          </div>
          <div className="app-content">
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className={isChatRoute ? 'app-container app-container--wide' : 'app-container'}>
        {!isChatRoute && (
          <div className="app-header">
            <h1>Ceasul Social</h1>
          </div>
        )}
        <div className={isChatRoute ? 'app-content app-content--chat' : 'app-content'}>
          <div className="route-container">
            <Routes>
              <Route path="/login" element={!user ? <Auth /> : <Navigate to="/" replace />} />
              <Route path="/role" element={<RoleSelectionRoute />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    {profile ? <Home user={user} profile={profile} /> : <Navigate to="/role" replace />}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations"
                element={
                  <ProtectedRoute>
                    <ConversationsList />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;