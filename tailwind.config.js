/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Legacy tokens (Task 1-7 "boxes inside boxes" aesthetic) ---
        // Kept in place so any file this pivot didn't touch keeps working.
        // Deprecated in favor of the flat command-shell tokens below —
        // safe to remove in a future cleanup once nothing references them.
        background: '#050816',
        panel: '#0f172a',
        risks: {
          green: '#22c55e',
          yellow: '#facc15',
          orange: '#f97316',
          red: '#ef4444',
        },

        // --- Flat command-shell tokens (Task 8 pivot) ---
        accent: '#5eead4', // unchanged — reused as-is for interactive/active states
        canvas: '#0A0A0B', // page background
        surface: '#131315', // subtle panel tint (never a bordered card — just a background shift)
        hairline: '#2A2A2E', // the ONLY border color used anywhere, always 1px
        ink: '#E4E4E7', // primary text
        'ink-dim': '#9CA3AF', // secondary/muted text (labels, timestamps)
        'ink-faint': '#6B7280', // tertiary text (placeholder, disabled)
        // Alias of `risks` above under the token name the pivot spec asked
        // for, same hex values — components can use either `risks-*` or
        // `risk-*` interchangeably; nothing under the old name was removed.
        risk: {
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