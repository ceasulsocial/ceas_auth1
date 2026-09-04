import React from 'react';

const ErrorScreen = ({ error = "An unexpected error occurred" }) => (
  <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Authentication Error</h2>
        <p className="text-gray-600 mb-6">
          {error || "Failed to initialize authentication. Please check your configuration."}
        </p>
      </div>
    </div>
  </div>
);

export default ErrorScreen;