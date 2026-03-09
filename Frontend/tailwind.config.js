/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#020617",
        card: "#020817",
        accent: "#38bdf8",
        "landing-bg": "#1A182F",
        "landing-card": "#2F2C4A",
        "landing-accent": "#8B5CF6",
        "landing-accent-end": "#06B6D4"
      }
    }
  },
  plugins: []
};
