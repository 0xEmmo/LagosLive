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
    bg: '#07070B', header: 'rgba(7,7,11,0.85)', nav: 'rgba(7,7,11,0.88)',
    surface: '#171725', surface2: '#0D0D15',
    glass: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.04)', border3: 'rgba(255,255,255,0.12)',
    text: '#FFFFFF', textMuted: '#A7A8B5', textFaint: '#6B6C80', textDim: '#6B6C80',
  },
  light: {
    bg: '#07070B', header: 'rgba(7,7,11,0.85)', nav: 'rgba(7,7,11,0.88)',
    surface: '#171725', surface2: '#0D0D15',
    glass: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.04)', border3: 'rgba(255,255,255,0.12)',
    text: '#FFFFFF', textMuted: '#A7A8B5', textFaint: '#6B6C80', textDim: '#6B6C80',
  },
};

export const PALETTE = {
  primary: '#FF2D95',
  secondary: '#8A2BE2',
  accent: '#00BFFF',
};

export const RETRO = {
  yellow: '#FFD600',
  pink: '#FF2D95',
  coral: '#FF8A00',
  purple: '#8A2BE2',
  green: '#00F5D4',
  blue: '#00BFFF',
  ink: '#07070B',
};

export const LUXURY = {
  red: '#800020',
  navy: '#0B1D34',
  pine: '#0E2B24',
  beige: '#A7A8B5',
  black: '#07070B',
};

export function brandAccent(theme: ThemeName) {
  return { from: '#FF2D95', to: '#8A2BE2', muted: '#A7A8B5' };
}

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
