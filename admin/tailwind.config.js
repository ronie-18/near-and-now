/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aqua green — the single brand hue. Everything else is white, the
        // default gray scale, and the semantic tones used by Badge/Alert.
        brand: {
          50: '#EDFAF8',
          100: '#D3F3EE',
          200: '#A8E7DD',
          300: '#72D4C7',
          400: '#3FBDAE',
          500: '#19A596',
          600: '#0F8A7D',
          700: '#0F6F66',
          800: '#105953',
          900: '#0D4A45',
          950: '#062E2B',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        popover: '0 4px 12px -2px rgb(16 24 40 / 0.12), 0 2px 4px -2px rgb(16 24 40 / 0.06)',
        modal: '0 20px 40px -12px rgb(16 24 40 / 0.25)',
      },
    },
  },
  plugins: [],
};
