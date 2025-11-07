import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  // Check if backend is available
  const checkBackendHealth = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
      setBackendOnline(true);
      return true;
    } catch (error) {
      console.warn('Backend is not available:', error.message);
      setBackendOnline(false);
      return false;
    }
  };

  // Configure axios to include credentials
  axios.defaults.withCredentials = true;

  const loginWithGoogle = async (code) => {
    if (!backendOnline) {
      throw new Error('Backend server is not available. Please make sure the server is running.');
    }

    try {
      const response = await axios.post(`${API_URL}/api/auth/google`, { code });
      setCurrentUser(response.data.user);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Google login failed');
    }
  };

  const signupWithEmail = async (userData) => {
    if (!backendOnline) {
      throw new Error('Backend server is not available. Please make sure the server is running.');
    }

    try {
      const response = await axios.post(`${API_URL}/api/auth/signup`, userData);
      setCurrentUser(response.data.user);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Signup failed');
    }
  };

  const loginWithEmail = async (email, password) => {
    if (!backendOnline) {
      throw new Error('Backend server is not available. Please make sure the server is running.');
    }

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      setCurrentUser(response.data.user);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const logout = async () => {
    if (backendOnline) {
      try {
        await axios.post(`${API_URL}/api/auth/logout`);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    setCurrentUser(null);
  };

  const getCurrentUser = async () => {
    if (!backendOnline) {
      setLoading(false);
      return null;
    }

    try {
      const response = await axios.get(`${API_URL}/api/auth/me`);
      setCurrentUser(response.data.user);
      return response.data.user;
    } catch (error) {
      setCurrentUser(null);
      return null;
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      await checkBackendHealth();
      await getCurrentUser();
      setLoading(false);
    };
    initializeAuth();
  }, []);

  const value = {
    currentUser,
    loginWithGoogle,
    signupWithEmail,
    loginWithEmail,
    logout,
    getCurrentUser,
    loading,
    backendOnline
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};