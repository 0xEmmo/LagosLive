import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-bebas)', 'cursive'],
        heading: ['var(--font-montserrat)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 8px 32px rgba(85,44,183,0.4)' },
          '50%': { boxShadow: '0 8px 52px rgba(85,44,183,0.8), 0 0 60px rgba(251,125,168,0.35)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
        'toast-in': {
          from: { transform: 'translate(-50%, -24px)', opacity: '0' },
          to: { transform: 'translate(-50%, 0)', opacity: '1' },
        },
        'splash-mark-in': {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'splash-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(240%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'pulse-glow': 'pulse-glow 1.5s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
        'toast-in': 'toast-in 0.35s cubic-bezier(0.2,0.9,0.3,1)',
        'splash-mark-in': 'splash-mark-in 0.55s cubic-bezier(0.22,0.9,0.3,1)',
        'splash-bar': 'splash-bar 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
