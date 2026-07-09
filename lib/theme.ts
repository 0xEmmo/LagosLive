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
    bg: '#14111F', header: 'rgba(20,17,31,0.9)', nav: 'rgba(17,15,26,0.95)',
    surface: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.05)',
    glass: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.08)', border3: 'rgba(255,255,255,0.1)',
    text: '#F1F5F9', textMuted: '#9691A3', textFaint: '#6B6478', textDim: '#5B5568',
  },
  light: {
    bg: '#F6F4FA', header: 'rgba(246,244,250,0.86)', nav: 'rgba(255,255,255,0.9)',
    surface: 'rgba(20,17,31,0.035)', surface2: 'rgba(20,17,31,0.05)',
    glass: 'rgba(20,17,31,0.045)', border: 'rgba(20,17,31,0.09)',
    border2: 'rgba(20,17,31,0.1)', border3: 'rgba(20,17,31,0.13)',
    text: '#211D2E', textMuted: '#5B5568', textFaint: '#847E96', textDim: '#9891A6',
  },
};

// Muted premium accent palette: plum-violet / wine-rose / champagne-gold
export const PALETTE = {
  primary: '#6D5A99',
  secondary: '#A85670',
  accent: '#B69763',
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
