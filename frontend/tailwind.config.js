/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#dc2626',
          dark: '#991b1b',
        },
      },
    },
  },
  plugins: [],
}
