/** @type {import('tailwindcss').Config} */
module.exports = {
  // Specify where Tailwind should look for your HTML/JSX/TSX files
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Enable the dark mode based on the 'dark' class applied to the root element
  darkMode: 'class', 
  theme: {
    extend: {
      colors: {
        // Define primary colors to match the app's theme
        'primary-red': '#dc2626', // A strong red color
      },
      // Define custom animations (like the pulsating hero)
      animation: {
        'pulse-slow': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
