import { createContext, useContext, useState, type PropsWithChildren } from 'react';

export const colors = {
  blue: '#147D92',
  ink: '#172C38',
  muted: '#71818C',
  background: '#F5F7F8',
  border: '#E6EBEE',
  navy: '#172F3B',
  green: '#168361',
  red: '#CE493E',
  amber: '#A96A12',
};
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 24, xxl: 32 };
export const radius = { small: 10, medium: 16, large: 24, pill: 999 };
export const lightPalette = {
  background: colors.background,
  surface: '#FFFFFF',
  input: '#F5F7F8',
  text: colors.ink,
  muted: '#6B7C87',
  border: colors.border,
  info: '#EAF4F6',
  success: '#E8F5EF',
  danger: '#FDEEEB',
  warning: '#FCF4E4',
};
export const darkPalette: typeof lightPalette = {
  background: '#0E1B22',
  surface: '#162832',
  input: '#1D333F',
  text: '#EDF4F7',
  muted: '#A0B3BE',
  border: '#2A414C',
  info: '#183D48',
  success: '#173D32',
  danger: '#482825',
  warning: '#423621',
};
const Context = createContext({ dark: false, toggle: () => {} });
export function KodaThemeProvider({ children }: PropsWithChildren) {
  const [dark, setDark] = useState(false);
  return (
    <Context.Provider value={{ dark, toggle: () => setDark((value) => !value) }}>
      {children}
    </Context.Provider>
  );
}
export function useTheme() {
  const theme = useContext(Context);
  return { ...theme, palette: theme.dark ? darkPalette : lightPalette };
}
