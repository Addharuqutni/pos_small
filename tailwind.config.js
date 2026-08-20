/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b8ceff',
          300: '#8eafff',
          400: '#6488f5',
          500: '#4669dc',
          600: '#3655c7',
          700: '#2d45a9',
          800: '#293b89',
          900: '#27356e',
          950: '#192144',
        },
        pos: {
          bg: '#f5f6f8',
          card: '#ffffff',
          sidebar: '#171a21',
          success: '#23845b',
          danger: '#c84b4b',
          warning: '#b87922',
        },
      },
      fontFamily: {
        sans: ['Nunito Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Rubik', 'Nunito Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgb(23 26 33 / 0.04), 0 12px 30px rgb(23 26 33 / 0.04)',
      },
      borderRadius: {
        panel: '14px',
      },
    },
  },
  plugins: [],
}
