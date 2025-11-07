import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  // 1. If loading, return null. This renders nothing (a blank screen) 
  // until the asynchronous authentication check is complete.
  if (loading) {
    return null; // or <></> or an empty <div> with your background styles
  }

  // 2. If not loading:
  //    - If currentUser exists (logged in), render the protected content.
  //    - If currentUser is null (not logged in), redirect to the login page.
  return currentUser ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;