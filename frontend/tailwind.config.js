/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'monopoly-red': '#ef4444',
        'monopoly-blue': '#3b82f6',
        'monopoly-green': '#22c55e',
        'monopoly-amber': '#f59e0b',
        'monopoly-bg': '#1a1a2e',
        'monopoly-card': '#16213e',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'pulse-fast': 'pulse 0.5s infinite',
      },
    },
  },
  plugins: [],
}
