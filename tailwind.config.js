module.exports = {
  purge: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        // Custom colors can be added here
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};