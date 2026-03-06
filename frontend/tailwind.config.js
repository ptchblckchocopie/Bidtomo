/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF3000',
          dark: '#CC2600',
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
        swiss: {
          accent: '#FF3000',
          black: '#000000',
          white: '#FFFFFF',
          muted: '#F2F2F2',
        },
      },
      fontFamily: {
        inter: ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'bh-sm': 'var(--shadow-bh-sm)',
        'bh-md': 'var(--shadow-bh-md)',
      },
      borderWidth: {
        'bh': '2px',
        'bh-lg': '4px',
      },
    },
  },
  plugins: [],
}
