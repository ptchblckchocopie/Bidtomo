/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bh: {
          bg: 'var(--color-bg)',
          fg: 'var(--color-fg)',
          border: 'var(--color-border)',
          muted: 'var(--color-muted)',
        },
        accent: {
          DEFAULT: '#10B981',
          light: '#34D399',
          dark: '#059669',
        },
        success: {
          DEFAULT: '#10B981',
          light: '#ECFDF5',
        },
        danger: {
          DEFAULT: '#EF4444',
          light: '#FEF2F2',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FFFBEB',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '8xl': ['8rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
        '9xl': ['10rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      letterSpacing: {
        'tighter': '-0.04em',
        'cinema': '-0.03em',
      },
      borderRadius: {
        DEFAULT: '10px',
        none: '0px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
        full: '9999px',
      },
      boxShadow: {
        'obsidian': '0 0 0 1px rgba(255, 255, 255, 0.04), 0 4px 24px rgba(0, 0, 0, 0.5)',
        'glow': '0 0 30px rgba(100, 140, 200, 0.08)',
        'glow-accent': '0 0 30px rgba(16, 185, 129, 0.12)',
        'lift': '0 8px 24px rgba(0, 0, 0, 0.08)',
        'lift-dark': '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
      transitionTimingFunction: {
        'vivid': 'cubic-bezier(0.52, 0.01, 0, 1)',
      },
    },
  },
  plugins: [],
}
