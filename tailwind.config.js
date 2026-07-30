/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: { DEFAULT: 'var(--ink)', soft: 'var(--ink-soft)' },
        slate: 'var(--slate)',
        line: 'var(--line)',
        signal: { DEFAULT: 'var(--signal)', ink: 'var(--signal-ink)' },
        moss: 'var(--moss)',
        clay: 'var(--clay)',
        surface: 'var(--surface)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        card: '18px',
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};