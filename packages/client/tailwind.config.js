/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'felt': {
          DEFAULT: '#0d5c2e',
          dark: '#0a4a24',
          light: '#0f6e36',
        },
        'card': {
          back: '#1e3a8a',
          border: '#d4af37',
        }
      },
      fontFamily: {
        'card': ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
