/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Original colors
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',

        // Material Design 3 color scheme for Near & Now
        "surface-dim": "#90e5c7",
        "primary-fixed": "#71ffbc",
        "background": "#d9ffef",
        "surface-bright": "#d9ffef",
        "secondary-fixed": "#5efcce",
        "on-tertiary-fixed-variant": "#005561",
        "on-primary-fixed": "#004b30",
        "primary-container": "#71ffbc",
        "surface-container-highest": "#9eecd0",
        "surface-container": "#b3f6dd",
        "tertiary-dim": "#005865",
        "on-primary": "#c9ffde",
        "on-error": "#ffefee",
        "tertiary-fixed-dim": "#00d1ec",
        "surface-variant": "#9eecd0",
        "surface": "#d9ffef",
        "surface-container-high": "#a8f1d6",
        "surface-container-low": "#bffee6",
        "on-secondary": "#c5ffe8",
        "on-primary-fixed-variant": "#006b46",
        "on-tertiary": "#daf8ff",
        "on-primary-container": "#00603e",
        "secondary-dim": "#005b46",
        "tertiary-container": "#00e0fd",
        "on-error-container": "#570008",
        "inverse-surface": "#00120b",
        "tertiary": "#006573",
        "on-surface": "#003629",
        "on-secondary-container": "#005d48",
        "tertiary-fixed": "#00e0fd",
        "on-tertiary-fixed": "#00363e",
        "error-dim": "#9f0519",
        "surface-tint": "#006945",
        "primary-fixed-dim": "#62f0ae",
        "on-secondary-fixed": "#004938",
        "error-container": "#fb5151",
        "on-surface-variant": "#306554",
        "inverse-primary": "#71ffbc",
        "outline": "#4c816f",
        "secondary-fixed-dim": "#4cedc1",
        "surface-container-lowest": "#ffffff",
        "outline-variant": "#82b8a4",
        "on-tertiary-container": "#004b56",
        "inverse-on-surface": "#72a894",
        "secondary-container": "#5efcce",
        "on-background": "#003629",
        "primary-dim": "#005c3b",
        "on-secondary-fixed-variant": "#006851"
      },
      fontFamily: {
        "headline": ["Lexend", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
      }
    },
  },
  plugins: [],
}
