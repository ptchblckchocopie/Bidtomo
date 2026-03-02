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
          bg: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
          fg: 'rgb(var(--color-fg-rgb) / <alpha-value>)',
          red: 'rgb(var(--color-red-rgb) / <alpha-value>)',
          blue: 'rgb(var(--color-blue-rgb) / <alpha-value>)',
          yellow: 'rgb(var(--color-yellow-rgb) / <alpha-value>)',
          border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
          muted: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'bh-sm': 'var(--shadow-bh-sm)',
        'bh-md': 'var(--shadow-bh-md)',
      },
      borderWidth: {
        'bh': '3px',
        'bh-lg': '5px',
      },
    },
  },
  plugins: [],
}
