/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#050816',
        panel: '#0f172a',
        accent: '#5eead4',
        risks: {
          green: '#22c55e',
          yellow: '#facc15',
          orange: '#f97316',
          red: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Rajdhani', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(94, 234, 212, 0.28)',
      },
    },
  },
  plugins: [],
}

