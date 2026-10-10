import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    screens: {
      sm: "40rem",
      md: "48rem",
      lg: "64rem",
      xl: "80rem",
      "2xl": "96rem",
    },
    extend: {
      colors: {
        primary: "#6750a4",
        "on-primary": "#ffffff",
        "primary-container": "#eaddff",
        secondary: "#625b71",
        "secondary-container": "#e8def8",
        surface: "#fef7ff",
        "surface-container": "#f3edf7",
        "surface-container-low": "#f7f2fa",
        "on-surface": "#1c1b1f",
        "on-surface-variant": "#49454f",
        outline: "#79747e",
        "outline-variant": "#cac4d0",
        error: "#b3261e",
        "md-blue": "#1a73e8",
        "md-green": "#1e8e3e",
        "md-red": "#ea4335",
        "md-yellow": "#fbbc04",
      },
      fontFamily: {
        sans: ['"Google Sans"', '"Roboto"', "sans-serif"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "28px",
      },
    },
  },
  plugins: [],
};

export default config;
