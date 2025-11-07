import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogOut, 
  User, 
  Home, 
  Clock, 
  Phone, 
  MapPin // Imported MapPin icon for city
} from 'lucide-react';

// Define the navigation links
const navItems = [
  { name: 'Home', icon: Home, action: () => console.log('Navigate to Home') }, 
  { name: 'Showtimes', icon: Clock, action: () => console.log('Navigate to Showtimes') }, 
  { name: 'Contact', icon: Phone, action: () => console.log('Navigate to Contact') }, 
];

const UserProfile = () => {
  const { currentUser, logout } = useAuth();
  
  // State for Theme (Dark/Light Mode)
  const [theme, setTheme] = useState('dark');
  
  // State for Current City
  const [currentCity, setCurrentCity] = useState('New York');

  if (!currentUser) return null;

  // --- Theme Toggle Logic ---
 
  
  // --- City Change Logic ---
  const handleChangeCity = () => {
    // NOTE: In a real application, this would open a modal or navigate to a city selection page.
    // For demonstration, we'll mock a simple toggle between two cities.
    const newCity = currentCity === 'New York' ? 'Los Angeles' : 'New York';
    setCurrentCity(newCity);
    console.log(`City changed to: ${newCity}`);
  };


  return (
    <div className="flex items-center space-x-4">
      
      {/* --- Navigation Buttons (Home, Showtimes, Contact) --- */}
      {navItems.map((item) => (
        <button
          key={item.name}
          onClick={item.action}
          className="flex items-center space-x-1 p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title={item.name}
        >
          <item.icon className="w-4 h-4" />
          <span className="font-medium hidden sm:inline">{item.name}</span>
        </button>
      ))}

      {/* --- City Display/Change Button --- */}
      <button
        onClick={handleChangeCity}
        className="flex items-center space-x-1 p-2 text-yellow-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        title="Change City"
      >
        <MapPin className="w-4 h-4" />
        <span className="font-medium">{currentCity}</span>
      </button>

      


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