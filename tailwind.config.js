import typography from '@tailwindcss/typography'

/**
 * Woodland Construction — luxury architectural theme.
 * Dark slate "ink" surfaces with warm brass accents and a parchment print palette.
 * Loaded by Tailwind v4 through the `@config` directive in src/index.css.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0d10',
          900: '#111418',
          850: '#15191e',
          800: '#1b2027',
          750: '#20262e',
          700: '#262c35',
          600: '#343c47',
          500: '#4a5361',
          400: '#6b7584',
          300: '#9aa3b0',
          200: '#c6ccd4',
          100: '#e6e9ed',
        },
        brass: {
          50: '#faf5ea',
          100: '#f2e6c9',
          200: '#e6cf98',
          300: '#d8b66b',
          400: '#c9a14a',
          500: '#b08a3a',
          600: '#8f6f2e',
          700: '#6e5524',
          800: '#4d3c1a',
        },
        parchment: {
          50: '#fbf9f4',
          100: '#f7f3ea',
          200: '#ede6d6',
        },
        verdigris: { 300: '#8fd1b4', 400: '#5fae8b', 500: '#3f8f6c' },
        ember: { 300: '#eba293', 400: '#d06b5b', 500: '#b04f40' },
        amberglow: { 400: '#d9a441' },
      },
      fontFamily: {
        display: [
          '"Iowan Old Style"',
          '"Palatino Linotype"',
          'Palatino',
          '"Book Antiqua"',
          '"URW Palladio L"',
          'Georgia',
          'serif',
        ],
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        brass: '0 0 0 1px rgba(201,161,74,0.35), 0 10px 30px -12px rgba(201,161,74,0.35)',
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
      },
      letterSpacing: {
        luxe: '0.22em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translate3d(0,6px,0)' },
          '100%': { opacity: '1', transform: 'translate3d(0,0,0)' },
        },
        shimmer: {
          '0%': { transform: 'translate3d(-100%,0,0)' },
          '100%': { transform: 'translate3d(100%,0,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.2,0.7,0.2,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [typography],
}
