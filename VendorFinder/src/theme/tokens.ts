// src/theme/tokens.ts
// Design tokens: the raw scales the theme is built from. Downstream apps
// re-brand by editing the palette + radii here; component code never
// hard-codes colors or spacing.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Brand palette. Swap these hex values to re-skin an app built on the template. */
export const palette = {
  brand50: '#EAF1FE',
  brand100: '#D6E4FD',
  brand500: '#4C8BF5',
  brand600: '#2F6FE0',
  brand700: '#1F55B8',
  success: '#2FBF71',
  warning: '#E0A030',
  danger: '#E5484D',
  danger600: '#C93B40',
  white: '#FFFFFF',
  black: '#05070B',
  // Neutral ramp
  gray50: '#F7F8FA',
  gray100: '#EDEFF3',
  gray200: '#DCE0E8',
  gray300: '#C2C8D4',
  gray400: '#9AA2B1',
  gray500: '#6B7280',
  gray600: '#4B5262',
  gray700: '#333A48',
  gray800: '#1C212C',
  gray900: '#12151C',
  gray950: '#0B0D12',
} as const;
