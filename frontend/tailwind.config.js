/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./src/ui/**/*.{tsx,ts,js,jsx}"],
  theme: {
    extend: {
      colors: {
        /* Legacy meama-* names — remapped to PRMTR v2.0 palette so existing
           markup inherits the new design without per-page edits. */
        meama: {
          espresso: "#F5F7F5",   // page background — cool off-white canvas
          roast:    "#ECEFEC",   // subtle tinted / sunken surface
          ivory:    "#FFFFFF",   // card surface
          brown:    "#121712",   // primary text — near-black ink
          cream:    "#525B53",   // secondary text
          charcoal: "#E0E4E1",   // borders / dividers (hairline)
          muted:    "#727B73",   // muted / placeholder / tertiary
          gold:     "#16823F",   // accent → brand green
          goldsoft: "#3A423B",   // softer accent
          sand:     "#CBD1CC",   // light text on dark surfaces
          green:    "#16823F",   // positive
          red:      "#CC2E33",   // critical / negative
          blue:     "#1A68CC",   // info / Meta
        },
        /* PRMTR v2.0 primitives — use these in new code. */
        gray: {
          0: "#FFFFFF", 25: "#FAFBFA", 50: "#F5F7F5", 100: "#ECEFEC",
          200: "#E0E4E1", 300: "#CBD1CC", 400: "#9BA39C", 500: "#727B73",
          600: "#525B53", 700: "#3A423B", 800: "#222823", 900: "#121712", 950: "#0A0D0A",
        },
        green: {
          50: "#E9F8EE", 100: "#CFF0DA", 200: "#A5E2BB", 300: "#6FCB90",
          400: "#3DAE68", 500: "#1F9D52", 600: "#16823F", 700: "#0F662F",
          800: "#0A4D24", 900: "#063318",
        },
        signal: {
          100: "#F2FAC9", 300: "#E4F784", 500: "#D2F03C", 600: "#B6D81F", 700: "#8FAA12",
        },
        danger:   { 50: "#FDECEC", 500: "#E5484D", 600: "#CC2E33", 700: "#A31C20" },
        warning:  { 50: "#FFF6E6", 500: "#F5A314", 600: "#C97E08", 700: "#9A5F04" },
        info:     { 50: "#EAF3FE", 500: "#2E84F0", 600: "#1A68CC", 700: "#1351A3" },
        critical: { 50: "#FCE9E9", 500: "#C2181E", 600: "#9E1115", 700: "#6E0B0E" },
      },
      fontFamily: {
        sans:    ["'Hanken Grotesk'", "Segoe UI", "system-ui", "sans-serif"],
        display: ["'Hanken Grotesk'", "Segoe UI", "system-ui", "sans-serif"],
        mono:    ["'Geist Mono'", "SFMono-Regular", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        editorial: "0.06em",
        loose: "0.04em",
      },
      borderRadius: {
        none: "0px",
        DEFAULT: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(18,23,18,.06), 0 1px 2px rgba(18,23,18,.04)",
        md: "0 4px 12px rgba(18,23,18,.07), 0 2px 4px rgba(18,23,18,.04)",
        lg: "0 12px 28px rgba(18,23,18,.10), 0 4px 8px rgba(18,23,18,.05)",
        pop: "0 16px 40px rgba(18,23,18,.16)",
      },
    },
  },
  plugins: [],
  presets: [require("./src/ui/tailwind.config.js")],
};
