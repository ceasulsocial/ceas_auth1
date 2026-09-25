import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { RoleSelection } from './components/RoleSelection';
import { Home } from './components/Home';
import { LoadingScreen } from './components/LoadingScreen';
import ConversationsList from './components/ConversationsList';
import './App.css';
import TrainerApplication from './components/TrainerApplication';
import AdminApplications from './components/AdminApplications';

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

  const isChatRoute = location.pathname.startsWith('/conversations');
  const isAdminRoute = location.pathname.startsWith('/admin');
  // const isApplyTrainerRoute = location.pathname.startsWith('/apply-trainer');

  const isWideRoute = isChatRoute || isAdminRoute 

  // ✅ use this instead of inline ternaries
  const containerClass = isAdminRoute
    ? 'app-container app-container--wide'
    : isWideRoute
    ? 'app-container app-container--wide'
    : 'app-container';

  const contentClass = isWideRoute
    ? 'app-content app-content--chat'
    : 'app-content';

  const appClass = isWideRoute ? 'app app--chat' : 'app';

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
    <div className={appClass}>
      <div className={containerClass}>
        {!isWideRoute && (
          <div className="app-header">
            <h1>Ceasul Social</h1>
          </div>
        )}
        <div className={contentClass}>
          <div className="route-container">
            <Routes>
              <Route
                path="/apply-trainer"
                element={
                  <ProtectedRoute>
                    <TrainerApplication />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/applications"
                element={
                  <ProtectedRoute>
                    <AdminApplications />
                  </ProtectedRoute>
                }
              />
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