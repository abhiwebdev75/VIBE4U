import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { 
  LogOut, 
  User, 
  Home, 
  Clock, 
  Phone,
} from 'lucide-react';

// Define the navigation links
const navItems = [
  { name: 'Home', icon: Home, action: () => console.log('Navigate to Home') }, 
  { name: 'Showtimes', icon: Clock, action: () => console.log('Navigate to Showtimes') }, 
  { name: 'Contact', icon: Phone, action: () => console.log('Navigate to Contact') }, 
];

const UserProfile = () => {
  const { currentUser, logout } = useAuth();
  
  if (!currentUser) return null;


  return (
    <div className="flex items-center space-x-4">
      
      {/* --- Navigation Buttons (Home, Showtimes, Contact) --- */}
      {navItems.slice(0, 1).map((item) => (
        <Link
          key={item.name}
          to="/"
          className="flex items-center space-x-1 p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title={item.name}
        >
          <item.icon className="w-4 h-4" />
          <span className="font-medium hidden sm:inline">{item.name}</span>
        </Link>
      ))}
      <Link to="/tickets" className="profile-link" title="Tickets"><TicketIcon /></Link>
      {(currentUser.role === 'branch_admin' || currentUser.role === 'super_admin') && <Link to="/manage" className="profile-link" title="Staff dashboard"><BarChartIcon /></Link>}

      


      {/* --- User Profile and Logout --- */}
      <div className="flex items-center space-x-3">
        {currentUser.picture ? (
          <img
            src={currentUser.picture}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-gray-900" />
          </div>
        )}
        <span className="text-white font-medium">{currentUser.name}</span>
      </div>
      <button
        onClick={logout}
        className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        title="Logout"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
};

export default UserProfile;

const TicketIcon = () => <span aria-hidden="true">▣</span>;
const BarChartIcon = () => <span aria-hidden="true">⌁</span>;