/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heebo: ['Heebo', 'sans-serif'],
      },
      colors: {
        // Palette inspired by Maaleh Film School logo (red + black)
        primary: {
          DEFAULT: '#C8102E',
          50: '#fef2f3',
          100: '#fde2e5',
          200: '#fbcad0',
          300: '#f7a0aa',
          400: '#f06d7e',
          500: '#e23a55',
          600: '#C8102E',   // logo red
          700: '#a40d24',
          800: '#871020',
          900: '#6f111f',
        },
        brand: {
          red: '#C8102E',
          redDark: '#9F0C24',
          black: '#0F0F0F',
        },
      },
    },
  },
  plugins: [],
}
