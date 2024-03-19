/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.{html,js}",
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