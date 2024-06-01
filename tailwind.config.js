/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/frontend/**/*.{html,js,templ}",
  ],
  theme: {
    extend: {
      fontFamily: {
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
}