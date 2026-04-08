import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070b18',
        panel: '#161e36',
        border: '#2c3654',
        muted: '#8b949e',
        grn: '#3fb950',
        red: '#f85149',
        accent: '#58a6ff',
      },
    },
  },
  plugins: [],
} satisfies Config;
