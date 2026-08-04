/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        naacp: {
          blue: {
            DEFAULT: '#002C6C',
            light: '#0a4294',
            dark: '#001a40',
          },
          gold: {
            DEFAULT: '#D4AF37',
            light: '#f5cf53',
            dark: '#a8861d',
          },
        },
      },
    },
  },
  plugins: [],
};
