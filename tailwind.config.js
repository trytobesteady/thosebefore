/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      "light",
      {
        dark: {
          "color-scheme": "dark",
          "primary": "oklch(65.69% 0.196 275.75)",
          "secondary": "oklch(74.8% 0.26 342.55)",
          "accent": "oklch(74.51% 0.167 183.61)",
          "neutral": "#2a323c",
          "neutral-content": "#d1d8e4",
          "base-100": "#1d232a",
          "base-200": "#161b21",
          "base-300": "#0f1317",
          "base-content": "#d1d8e4",
        },
      },
    ],
  },
}
