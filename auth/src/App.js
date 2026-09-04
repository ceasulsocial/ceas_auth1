import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth'; 
import { RoleSelection } from './components/RoleSelection';
import { Home } from './components/Home';
import { LoadingScreen } from './components/LoadingScreen';
import ConversationsList from './components/ConversationsList';
import './App.css';

// debuggin bullshit
console.log('Auth:', Auth);
console.log('Role:', RoleSelection);
console.log('Home:', Home);
console.log('Loading:', LoadingScreen);

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
  
  // remove the profile check to allow access even with existing profile
  return <RoleSelection />;
}

//  !!! this is a helper function, not exported !!!
function AppContent() {
  const { user, profile, loading } = useAuth();
  
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
      <div className="app-container">
        <div className="app-header">
          <h1>Ceasul Social</h1>
        </div>
        <div className="app-content">
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