/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./src/ui/**/*.{tsx,ts,js,jsx}"],
  theme: {
    extend: {
      colors: {
        meama: {
          espresso: "#F4F0EA",   // page background — sandy clay
          roast:    "#EDEBE5",   // subtle tinted surface
          ivory:    "#FFFFFF",   // card surface — pure white
          brown:    "#0D0D0D",   // primary text — near black
          cream:    "#6E6B67",   // secondary text — warm mid-gray
          charcoal: "#D8D4CE",   // borders / dividers
          muted:    "#9C9894",   // muted / placeholder
          gold:     "#0D0D0D",   // accent (monochrome editorial)
          goldsoft: "#444140",   // softer accent
          sand:     "#C8C3BC",   // light text on dark surfaces
          green:    "#1A3D1F",   // positive (deep forest)
          red:      "#8B1A14",   // critical / negative (deep burgundy)
          blue:     "#1C3A7A",   // info / Meta
        },
      },
      fontFamily: {
        sans:    ["Inter", "Barlow", "system-ui", "sans-serif"],
        display: ["'Bebas Neue'", "Impact", "sans-serif"],
        mono:    ["'Space Mono'", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        editorial: "0.22em",
        loose: "0.12em",
      },
    },
  },
  plugins: [],
  presets: [require("./src/ui/tailwind.config.js")],
};
