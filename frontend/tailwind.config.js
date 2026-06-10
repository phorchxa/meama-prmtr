/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        meama: {
          brown: "#3E1F00",
          gold: "#C8963E",
          cream: "#FAF3E0",
          charcoal: "#1C1C1E",
          green: "#2D6A4F", // positive
          red: "#C0392B", // negative / critical
          blue: "#2C3E7A", // info / Meta
          muted: "#6B6B6B",
        },
      },
      fontFamily: {
        sans: ["Inter", "DejaVu Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
