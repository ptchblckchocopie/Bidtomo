/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#D02020',
          dark: '#991b1b',
        },
        bh: {
          bg: '#F0F0F0',
          fg: '#121212',
          red: '#D02020',
          blue: '#1040C0',
          yellow: '#F0C020',
          border: '#121212',
          muted: '#E0E0E0',
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'bh-sm': '3px 3px 0px #121212',
        'bh-md': '5px 5px 0px #121212',
      },
      borderWidth: {
        'bh': '3px',
        'bh-lg': '5px',
      },
    },
  },
  plugins: [],
}
