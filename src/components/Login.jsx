import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// IMPORTANT: Update this import to your general Auth hook (e.g., useAuth)
import { useGoogleAuth } from '../hooks/useGoogleAuth'; 
import { Film } from 'lucide-react';

// --- MOCK ADMIN CREDENTIALS ---
// In a real application, you would manage roles server-side, 
// not hardcode them in the frontend like this!
const MOCK_ADMIN_EMAIL = 'admin@vibe4u.com';
const MOCK_ADMIN_PASSWORD = 'admin@123';
// ---

// Spinner SVG for loading state (Kept for consistency)
const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const Login = () => {
    // New state for Email/Password inputs
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // Existing states
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Auth hook
    const { handleGoogleLogin, handleEmailLogin } = useGoogleAuth(); 
    const navigate = useNavigate();

    // --- Google Sign-In Handler (Existing Logic) ---
    const handleGoogleSignIn = async () => {
        // ... (Google sign-in logic remains the same)
        try {
            setError('');
            setLoading(true);
            const result = await handleGoogleLogin();

            if (result.success) {
                // NOTE: For Google login, you'd typically check roles *after*
                // the authentication service returns a user object.
                navigate('/');
            } else {
                setError(result.error || 'Google sign-in failed.');
            }
        } catch (error) {
            setError('An unexpected error occurred during Google sign-in.');
        } finally {
            setLoading(false);
        }
    };

    // --- UPDATED: Email/Password Sign-In Handler with Admin Check ---
    const handleLoginSubmit = async (e) => {
        e.preventDefault(); // Prevent default form submission
        
        // Basic validation
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }

        try {
            setError('');
            setLoading(true);

            // 1. **Check for Mock Admin Credentials**
            if (email === MOCK_ADMIN_EMAIL && password === MOCK_ADMIN_PASSWORD) {
                // Since this is a mock, we bypass the actual auth service call
                // and treat the login as successful with an ADMIN role.
                console.log("Admin login successful!");
                
                // Navigate to the dedicated Admin dashboard route
                navigate('/admin-dashboard'); 
                return; // Exit the function after successful admin login
            }
            
            // 2. **Proceed with Regular User Login**
            
            // Call your actual email/password login function
            const result = await handleEmailLogin(email, password); 

            if (result.success) {
                // After successful regular login, navigate to the standard homepage
                navigate('/');
            } else {
                // Display error from the backend/auth service
                setError(result.error || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            setError('A network or unexpected error occurred during login.');
        } finally {
            setLoading(false);
        }
    };

    return (
        // Outermost container for full-screen background
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900 flex items-center justify-center p-4" style={{ width: '100vw', height: '100vh' }}>
            {/* Login Card Container */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center mb-4">
                        {/* Film icon and App Name */}
                        <Film className="h-10 w-10 text-yellow-300 mr-2" /> 
                        <span className="text-3xl font-extrabold text-white tracking-wider">VIBE4U</span>
                    </div>
                    <h2 className="text-3xl font-bold text-white">Welcome Back</h2>
                    <p className="text-gray-300 mt-2">Sign in to your account</p>
                </div>

                {/* Error Message Display */}
                {error && (
                    <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-center">
                        {error}
                    </div>
                )}

                {/* Email and Password Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                        />
                    </div>
                    
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-yellow-500 text-gray-900 py-3 px-4 rounded-lg font-bold hover:bg-yellow-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center disabled:opacity-50"
                    >
                        {loading ? (
                            <span className="flex items-center">
                                <Spinner />
                                Logging in...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                {/* Divider for OR */}
                <div className="flex items-center my-6">
                    <div className="flex-grow border-t border-gray-700"></div>
                    <span className="flex-shrink mx-4 text-gray-400 font-medium">OR</span>
                    <div className="flex-grow border-t border-gray-700"></div>
                </div>

                {/* Google Sign-In Button (Existing Logic) */}
                <div className="space-y-6">
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center disabled:opacity-50"
                    >
                        <span className="flex items-center">
                            {/* Google SVG Icon */}
                            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign in with Google
                        </span>
                    </button>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-gray-400">
                        Don't have an account?{' '}
                        <Link to="/signup" className="text-yellow-400 hover:text-yellow-300 font-semibold transition-colors hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;