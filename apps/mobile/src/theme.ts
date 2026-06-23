// Современная светлая палитра для финансового приложения: мягкий фон, контрастный текст, живые акценты.
export const colors = {
  bg: '#F3F6FB',
  bgDeep: '#E8EEF8',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#EEF3FA',
  cardPressed: '#E7EEF8',
  primarySoft: '#E7F0FF',
  mintSoft: '#E8FBF5',
  yellowSoft: '#FFF6D8',
  redSoft: '#FFECEC',
  violetSoft: '#F0ECFF',
  text: '#111827',
  textMuted: '#64748B',
  textSubtle: '#9AA6B5',
  primary: '#2F6BFF',
  primaryDark: '#1746B8',
  primaryAlt: '#12B8D6',
  accent: '#FFD84D',
  accentText: '#2B2B2B',
  primaryText: '#FFFFFF',
  income: '#16A34A',
  expense: '#F04438',
  warning: '#F59E0B',
  border: '#E3EAF3',
  borderStrong: '#CBD5E1',
  shadow: '#9CAEC6',
  overlay: 'rgba(17, 24, 39, 0.08)',
};

export const spacing = (n: number) => n * 8;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  floating: {
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
};
