const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// In-memory store (replace with database in production)
const users = new Map();
const emailToId = new Map();

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name 
    }, 
    JWT_SECRET, 
    { expiresIn: '7d' }
  );
};

// Email signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    console.log('Signup attempt:', { name, email });

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    if (emailToId.has(email)) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = `email_${Date.now()}`;
    const user = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      authProvider: 'email'
    };

    users.set(userId, user);
    emailToId.set(email, userId);

    // Generate token
    const token = generateToken(user);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('User created successfully:', userId);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Email login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userId = emailToId.get(email);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = users.get(userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google OAuth endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { code } = req.body;

    console.log('Google OAuth attempt with code');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:5173'
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const { id, email, name, picture } = userResponse.data;

    let user = users.get(id);
    if (!user) {
      user = {
        id,
        email,
        name,
        picture,
        createdAt: new Date(),
        authProvider: 'google'
      };
      users.set(id, user);
      emailToId.set(email, id);
    }

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('Google OAuth successful for user:', email);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Google authentication failed',
      details: error.response?.data || error.message 
    });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    const user = users.get(verified.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth endpoints available`);
});