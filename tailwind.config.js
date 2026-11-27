/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  // Badge colours are built in app.js as `bg-${color}-100 text-${color}-700`, so list them here.
  safelist: [
    { pattern: /^(bg-(emerald|amber|red|slate)-100|text-(emerald|amber|red|slate)-700)$/ },
  ],
  theme: { extend: {} },
  plugins: [],
};
