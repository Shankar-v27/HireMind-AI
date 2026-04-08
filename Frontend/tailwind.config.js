/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
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
        "landing-accent-end": "#06B6D4",
        // shadcn color scheme
        primary: "#ffffff",
        "primary-foreground": "#000000",
        secondary: "#18181b",
        "secondary-foreground": "#fafafa",
        destructive: "#ef4444",
        "destructive-foreground": "#fafafa",
        muted: "#71717a",
        "muted-foreground": "#a1a1aa",
        accent: "#a1a1aa",
        "accent-foreground": "#000000",
        popover: "#09090b",
        "popover-foreground": "#fafafa",
        background: "#000000",
        foreground: "#fafafa",
        input: "#27272a",
        ring: "#52525b",
      }
    }
  },
  plugins: []
};
