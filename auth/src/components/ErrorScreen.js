import React from 'react';

const ErrorScreen = ({ error = 'An unexpected error occurred' }) => (
  <div className="error-screen">
    <div className="error-screen-card">
      <h2 className="error-screen-title">Authentication Error</h2>
      <p className="error-screen-message">
        {error || 'Failed to initialize authentication. Please check your configuration.'}
      </p>
    </div>
  </div>
);

export default ErrorScreen;