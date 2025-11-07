import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { Film, Eye, EyeOff, Check, X } from 'lucide-react';

const Signup = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false
  });

  const { signupWithEmail } = useAuth();
  const { handleGoogleLogin } = useGoogleAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check password strength
    if (name === 'password') {
      setPasswordStrength({
        length: value.length >= 6,
        uppercase: /[A-Z]/.test(value),
        lowercase: /[a-z]/.test(value),
        number: /[0-9]/.test(value)
      });
    }
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Please enter your full name');
      return false;
    }

    if (!formData.email.trim()) {
      setError('Please enter your email');
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setError('');
      setLoading(true);
      await signupWithEmail({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password
      });
      navigate('/');
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleGoogleSignUp = async () => {
    try {
      setError('');
      setLoading(true);
      const result = await handleGoogleLogin();
      
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('Failed to sign up with Google');
    } finally {
      setLoading(false);
    }
  };

  const PasswordRequirement = ({ met, text }) => (
    <div className={`flex items-center space-x-2 ${met ? 'text-green-400' : 'text-gray-400'}`}>
      {met ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      <span className="text-sm">{text}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-gray-900 flex items-center justify-center p-4" style={{ width: '100vw', height: '100vh' }}>
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 mt-50 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Film className="h-10 w-10 text-yellow-400 mr-2" />
            <span className="text-2xl font-bold text-white">VIBE4U</span>
          </div>
          <h2 className="text-3xl font-bold text-white">Create Account</h2>
          <p className="text-gray-300 mt-2">Join VIBE4U today</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all"
              placeholder="Enter your full name"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all pr-12"
                placeholder="Create a password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="mt-3 space-y-2">
                <PasswordRequirement met={passwordStrength.length} text="At least 6 characters" />
                <PasswordRequirement met={passwordStrength.uppercase} text="One uppercase letter" />
                <PasswordRequirement met={passwordStrength.lowercase} text="One lowercase letter" />
                <PasswordRequirement met={passwordStrength.number} text="One number" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all pr-12"
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow-400 text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-yellow-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-transparent text-gray-400">Or sign up with</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <button
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign up with Google
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="text-yellow-400 hover:text-yellow-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;