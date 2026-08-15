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
      colors: {
        bg: '#07070B',
        'bg-secondary': '#0D0D15',
        card: '#171725',
        glass: 'rgba(255,255,255,0.05)',
        border: 'rgba(255,255,255,0.08)',
        pink: '#FF2D95',
        purple: '#8A2BE2',
        blue: '#00BFFF',
        teal: '#00F5D4',
        gold: '#FFD600',
        orange: '#FF8A00',
        white: '#FFFFFF',
        muted: '#A7A8B5',
      },
      boxShadow: {
        'premium': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(255,45,149,.18)',
        'premium-lg': '0 20px 60px rgba(0,0,0,.5), 0 0 50px rgba(255,45,149,.22)',
        'premium-purple': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(138,43,226,.18)',
        'premium-blue': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(0,191,255,.15)',
        'premium-teal': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(0,245,212,.15)',
        'premium-gold': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(255,214,0,.15)',
        'premium-orange': '0 10px 40px rgba(0,0,0,.45), 0 0 30px rgba(255,138,0,.15)',
        'glow-pink': '0 0 30px rgba(255,45,149,.3), 0 0 60px rgba(255,45,149,.12)',
        'glow-purple': '0 0 30px rgba(138,43,226,.3), 0 0 60px rgba(138,43,226,.12)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 8px 32px rgba(138,43,226,0.3)' },
          '50%': { boxShadow: '0 8px 52px rgba(138,43,226,0.6), 0 0 60px rgba(255,45,149,0.25)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'ken-burns': {
          from: { transform: 'scale(1) translate(0, 0)' },
          to: { transform: 'scale(1.12) translate(-1%, -1.5%)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(calc(-100% - var(--gap)))' },
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
        'shiny-text': {
          '0%, 90%, 100%': { backgroundPosition: 'calc(-100% - var(--shiny-width, 100px)) 0' },
          '30%, 60%': { backgroundPosition: 'calc(100% + var(--shiny-width, 100px)) 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.16,1,0.3,1)',
        'pulse-glow': 'pulse-glow 1.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'ken-burns': 'ken-burns 2.6s ease-out forwards',
        marquee: 'marquee var(--duration,32s) linear infinite',
        spin: 'spin 1s linear infinite',
        'toast-in': 'toast-in 0.35s cubic-bezier(0.2,0.9,0.3,1)',
        'splash-mark-in': 'splash-mark-in 0.55s cubic-bezier(0.22,0.9,0.3,1)',
        'splash-bar': 'splash-bar 1.1s ease-in-out infinite',
        'shiny-text': 'shiny-text 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
