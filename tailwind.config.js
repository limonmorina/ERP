/**
 * Tailwind theme for HSM Furniture ERP.
 * Extends brand (green), ink (warm neutrals), accent (terracotta), and display/sans/mono fonts.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7f5',
          100: '#e3ebe6',
          200: '#c5d7cb',
          300: '#9bb8a6',
          400: '#6e947d',
          500: '#4f7760',
          600: '#3d5f4c',
          700: '#324d3e',
          800: '#2a3f34',
          900: '#24352c',
          950: '#121c17',
        },
        ink: {
          50: '#f6f5f1',
          100: '#e8e6dc',
          200: '#d2cebc',
          300: '#b8b197',
          400: '#a09878',
          500: '#8f8668',
          600: '#7a7158',
          700: '#635c49',
          800: '#544e40',
          900: '#494438',
          950: '#27241d',
        },
        accent: {
          DEFAULT: '#c45c26',
          soft: '#f3e0d4',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(36,53,44,0.06), 0 12px 32px -16px rgba(18,28,23,0.35)',
      },
    },
  },
  plugins: [],
};
