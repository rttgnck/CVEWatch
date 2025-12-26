/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'system-ui',
          'sans-serif'
        ],
        mono: [
          'SF Mono',
          'Menlo',
          'Monaco',
          'monospace'
        ]
      },
      colors: {
        // LessPorts exact colors from screenshot
        'lp': {
          // Backgrounds
          'bg': '#0d0b14',           // Main background (darkest)
          'surface': '#151320',       // Card/surface background
          'elevated': '#1c1928',      // Elevated surface
          'hover': '#252233',         // Hover state
          
          // Borders
          'border': '#2a2639',        // Default border
          'border-light': '#3a3650',  // Light border
          
          // Text
          'text': '#ffffff',          // Primary text
          'text-secondary': '#a09bb0', // Secondary text
          'text-muted': '#6b6680',    // Muted text
          
          // Accents
          'orange': '#e8833a',        // Primary accent (orange)
          'orange-hover': '#f0944d',
          'green': '#4ade80',         // Success/active
          'green-dim': '#22c55e',
          'purple': '#a855f7',        // Purple accent
          'red': '#ef4444',           // Error/critical
        },
        // CVE Severity
        'severity': {
          'critical': '#dc2626',      // Red
          'high': '#ea580c',          // Orange
          'medium': '#ca8a04',        // Yellow
          'low': '#16a34a',           // Green
          'none': '#6b7280'           // Gray
        }
      },
      boxShadow: {
        'dropdown': '0 25px 60px -12px rgba(0, 0, 0, 0.6)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.2)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
