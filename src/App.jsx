import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Signup from './components/Signup';
import HomePage from './pages/HomePage';
import UserProfile from './components/UserProfile';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen app-frame">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>
                    <nav className="top-nav">
                      <div className="brand">VIBE<span>4U</span></div>
                      <UserProfile />
                    </nav>
                    <HomePage />
                  </div>
                </ProtectedRoute>
              }
            />
            <Route path="/tickets" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/manage" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
