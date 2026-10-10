/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/index.html", "./src/client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kairos: {
          50: "#f5f5f0",
          100: "#e8e8dd",
          200: "#d3d3c0",
          300: "#b6b69a",
          400: "#969677",
          500: "#7a7a5e",
          600: "#5a5a40",
          700: "#4a4a35",
          800: "#3d3d2c",
          900: "#343425",
        },
      },
    },
  },
  plugins: [],
};
