// src/theme/colors.ts
// Semantic color roles for light and dark schemes, derived from tokens.
// Components reference roles (`colors.text`, `colors.surface`) — never raw
// palette values — so theming stays consistent and swappable.

import { palette } from './tokens';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  dangerPressed: string;
  overlay: string;
  tabActive: string;
  tabInactive: string;
}

export const lightColors: ThemeColors = {
  background: palette.gray50,
  surface: palette.white,
  surfaceAlt: palette.gray100,
  card: palette.white,
  border: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray500,
  textInverse: palette.white,
  primary: palette.brand600,
  primaryPressed: palette.brand700,
  onPrimary: palette.white,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  dangerPressed: palette.danger600,
  overlay: 'rgba(5, 7, 11, 0.45)',
  tabActive: palette.brand600,
  tabInactive: palette.gray400,
};

export const darkColors: ThemeColors = {
  background: palette.gray950,
  surface: palette.gray900,
  surfaceAlt: palette.gray800,
  card: palette.gray900,
  border: palette.gray800,
  text: palette.gray50,
  textMuted: palette.gray400,
  textInverse: palette.gray950,
  primary: palette.brand500,
  primaryPressed: palette.brand600,
  onPrimary: palette.white,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  dangerPressed: palette.danger600,
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabActive: palette.brand500,
  tabInactive: palette.gray500,
};
