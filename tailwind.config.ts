import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0c",
          900: "#0f1014",
          800: "#15171d",
          700: "#1f222b",
          600: "#2a2e39",
          500: "#3a3f4d",
          400: "#6b7280",
          300: "#9aa3b2",
          200: "#c8cdd6",
          100: "#e6e8ee",
        },
        ember: {
          DEFAULT: "#ff6a3d",
          dim: "#c44a25",
          glow: "#ffb499",
        },
        cool: {
          DEFAULT: "#7bd1c5",
          dim: "#3a8f86",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        display: ['"Instrument Serif"', "ui-serif", "Georgia", "serif"],
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        "trace-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "caret": {
          "0%, 50%": { opacity: "1" },
          "50.01%, 100%": { opacity: "0" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "trace-in": "trace-in 320ms cubic-bezier(.2,.7,.2,1) both",
        "caret": "caret 1s steps(2) infinite",
        "shimmer": "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
