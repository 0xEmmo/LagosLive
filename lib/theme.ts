export type ThemeName = 'dark' | 'light';

export interface ThemeTokens {
  bg: string;
  header: string;
  nav: string;
  surface: string;
  surface2: string;
  glass: string;
  border: string;
  border2: string;
  border3: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textDim: string;
}

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  dark: {
    bg: '#181123', header: 'rgba(24,17,35,0.9)', nav: 'rgba(20,14,29,0.95)',
    surface: 'rgba(255,255,255,0.05)', surface2: 'rgba(255,255,255,0.06)',
    glass: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.09)',
    border2: 'rgba(255,255,255,0.1)', border3: 'rgba(255,255,255,0.14)',
    text: '#FFFBF3', textMuted: '#C4B8D9', textFaint: '#8E7FA8', textDim: '#6E6084',
  },
  light: {
    bg: '#FFF8EC', header: 'rgba(255,248,236,0.88)', nav: 'rgba(255,255,255,0.94)',
    surface: '#FFFFFF', surface2: '#FFFFFF',
    glass: 'rgba(26,20,15,0.045)', border: 'rgba(26,20,15,0.85)',
    border2: 'rgba(26,20,15,0.14)', border3: 'rgba(26,20,15,0.85)',
    text: '#1A140F', textMuted: '#6E6558', textFaint: '#948A7C', textDim: '#B0A594',
  },
};

// Retro pop palette: sunshine yellow / bubblegum pink / coral / grape purple / emerald / sky blue
export const PALETTE = {
  primary: '#552CB7',
  secondary: '#FB7DA8',
  accent: '#FFC567',
};

export const RETRO = {
  yellow: '#FFC567',
  pink: '#FB7DA8',
  coral: '#FD5A46',
  purple: '#552CB7',
  green: '#00995E',
  blue: '#058CD7',
  ink: '#1A140F',
};

export function themeCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    '--c-bg': tokens.bg,
    '--c-header': tokens.header,
    '--c-nav': tokens.nav,
    '--c-surface': tokens.surface,
    '--c-surface2': tokens.surface2,
    '--c-glass': tokens.glass,
    '--c-border': tokens.border,
    '--c-border2': tokens.border2,
    '--c-border3': tokens.border3,
    '--c-text': tokens.text,
    '--c-text-muted': tokens.textMuted,
    '--c-text-faint': tokens.textFaint,
    '--c-text-dim': tokens.textDim,
  };
}
