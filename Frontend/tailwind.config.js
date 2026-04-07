/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        card: "#09090b",
        accent: "#a1a1aa",
        "landing-bg": "#000000",
        "landing-card": "#18181b",
        "landing-accent": "#8B5CF6",
        "landing-accent-end": "#06B6D4"
      }
    }
  },
  plugins: []
};
