import { useColorScheme } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export function useAppColors() {
  const colors = useColors();
  const scheme = useColorScheme();
  const { preferences } = useApp();
  if (!preferences.highContrast) return colors;
  const dark = scheme === 'dark';
  return {
    ...colors,
    background: dark ? '#000000' : '#FFFFFF',
    foreground: dark ? '#FFFFFF' : '#000000',
    text: dark ? '#FFFFFF' : '#000000',
    card: dark ? '#090909' : '#FFFFFF',
    cardForeground: dark ? '#FFFFFF' : '#000000',
    secondary: dark ? '#202020' : '#F0F0F0',
    secondaryForeground: dark ? '#FFFFFF' : '#000000',
    muted: dark ? '#202020' : '#F0F0F0',
    mutedForeground: dark ? '#E5E5E5' : '#202020',
    accent: dark ? '#303030' : '#E8E8E8',
    accentForeground: dark ? '#FFFFFF' : '#000000',
    destructive: dark ? '#FF9B9F' : '#9B1C24',
    destructiveForeground: dark ? '#000000' : '#FFFFFF',
    border: dark ? '#FFFFFF' : '#202020',
    input: dark ? '#FFFFFF' : '#202020',
    primary: dark ? '#8FFFEA' : '#00594C',
    primaryForeground: dark ? '#000000' : '#FFFFFF',
  };
}
