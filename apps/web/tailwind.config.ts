import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
      },
      borderRadius: {
        'clay': '1rem',
        'clay-lg': '1.5rem',
      },
      boxShadow: {
        'clay-sm': '4px 4px 8px hsl(30 8% 8% / 0.3), -2px -2px 6px hsl(30 8% 20% / 0.1), inset 0 1px 0 hsl(30 8% 22% / 0.2)',
        'clay-md': '8px 8px 16px hsl(30 8% 8% / 0.4), -4px -4px 12px hsl(30 8% 20% / 0.15), inset 0 1px 0 hsl(30 8% 22% / 0.3)',
        'clay-lg': '12px 12px 24px hsl(30 8% 8% / 0.5), -6px -6px 16px hsl(30 8% 20% / 0.2), inset 0 2px 0 hsl(30 8% 22% / 0.3)',
        'clay-inset': 'inset 2px 2px 4px hsl(30 8% 8% / 0.3), inset -1px -1px 3px hsl(30 8% 20% / 0.1)',
        'clay-pressed': 'inset 3px 3px 6px hsl(30 8% 8% / 0.4), inset -2px -2px 4px hsl(30 8% 20% / 0.1)',
      },
    },
  },
  plugins: [animate],
}

export default config
