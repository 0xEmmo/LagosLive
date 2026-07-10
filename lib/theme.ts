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
    bg: '#111111', header: 'rgba(17,17,17,0.9)', nav: 'rgba(14,14,14,0.95)',
    surface: '#171A1F', surface2: '#191D22',
    glass: 'rgba(166,161,147,0.06)', border: 'rgba(166,161,147,0.22)',
    border2: 'rgba(166,161,147,0.14)', border3: 'rgba(166,161,147,0.3)',
    text: '#F2EFE9', textMuted: '#A6A193', textFaint: '#83806F', textDim: '#625F53',
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

// Luxury dark palette used for always-dark brand moments (splash, toast) and dark theme mode
export const LUXURY = {
  red: '#800020',
  navy: '#0B1D34',
  pine: '#0E2B24',
  beige: '#A6A193',
  black: '#111111',
};

// Brand accent pair for always-dark surfaces (Splash, Toast, FolderReveal) that don't
// otherwise change with the theme toggle — keeps them visually consistent with whichever
// mode is active instead of a single fixed color.
export function brandAccent(theme: ThemeName) {
  // Brightened red (not the raw swatch) so text/fills stay legible against a near-black bg
  return theme === 'dark' ? { from: '#C4102E', to: LUXURY.navy, muted: LUXURY.beige } : { from: PALETTE.primary, to: PALETTE.secondary, muted: '#C4B8D9' };
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
