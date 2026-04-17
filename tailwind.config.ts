import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
        },
        border: {
          1: 'var(--border-1)',
          2: 'var(--border-2)',
        },
        text: {
          0: 'var(--text-0)',
          1: 'var(--text-1)',
          2: 'var(--text-2)',
        },
        accent: {
          amber: 'var(--accent-amber)',
          red: 'var(--accent-red)',
          cyan: 'var(--accent-cyan)',
          green: 'var(--accent-green)',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)'],
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '2px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
