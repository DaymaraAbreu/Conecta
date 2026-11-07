/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#142C2B',
    tint: '#176C63',
    background: '#F5F8F5',
    foreground: '#142C2B',
    card: '#FFFFFF',
    cardForeground: '#142C2B',
    primary: '#176C63',
    primaryForeground: '#FFFFFF',
    secondary: '#E6F1EC',
    secondaryForeground: '#20564F',
    muted: '#EDF1EE',
    mutedForeground: '#667875',
    accent: '#F4E9E1',
    accentForeground: '#7A4832',
    destructive: '#B83C43',
    destructiveForeground: '#FFFFFF',
    border: '#DCE5E0',
    input: '#DCE5E0',
    avatar1: '#D9ECE5',
    avatar2: '#F5E2D5',
    avatar3: '#E8E3F2',
    avatar4: '#E7EDCF',
    avatarText: '#244D47',
  },
  dark: {
    text: '#E9F2EE',
    tint: '#78C6B5',
    background: '#101B1A',
    foreground: '#E9F2EE',
    card: '#192725',
    cardForeground: '#E9F2EE',
    primary: '#78C6B5',
    primaryForeground: '#10201D',
    secondary: '#263936',
    secondaryForeground: '#D3EAE2',
    muted: '#263330',
    mutedForeground: '#A1B2AC',
    accent: '#3C302A',
    accentForeground: '#F2C8AF',
    destructive: '#FF8588',
    destructiveForeground: '#281012',
    border: '#30423E',
    input: '#30423E',
    avatar1: '#28463F',
    avatar2: '#49372E',
    avatar3: '#3C354D',
    avatar4: '#3D482B',
    avatarText: '#E9F2EE',
  },
  radius: 14,
};

export default colors;
