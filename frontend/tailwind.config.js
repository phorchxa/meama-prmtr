/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./src/ui/**/*.{tsx,ts,js,jsx}"],
  theme: {
    extend: {
      colors: {
        meama: {
          brown: "#3E1F00",
          espresso: "#241102", // darkest warm surface (app background)
          roast: "#341A04", // dark panel surface
          gold: "#C8963E",
          goldsoft: "#E8C98A",
          cream: "#FAF3E0",
          ivory: "#FFF9EC", // card surface
          charcoal: "#1C1C1E",
          green: "#2D6A4F", // positive
          red: "#C0392B", // negative / critical
          blue: "#2C3E7A", // info / Meta
          muted: "#6B6B6B",
        },
      },
      fontFamily: {
        sans: ["Inter", "DejaVu Sans", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
  presets: [require("./src/ui/tailwind.config.js")]
};
