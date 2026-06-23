import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function SoftCard({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.softCard, style]} {...rest}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'yellow';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  const isYellow = variant === 'yellow';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isGhost && styles.buttonGhost,
        isDanger && styles.buttonDanger,
        isYellow && styles.buttonYellow,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.primary : isYellow ? colors.accentText : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, isGhost && { color: colors.primary }, isYellow && { color: colors.accentText }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={{ marginBottom: spacing(1.5) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

export function SearchField({ placeholder = 'Поиск' }: { placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Text style={{ fontSize: 22, color: colors.textMuted, marginRight: 8 }}>⌕</Text>
      <Text style={{ color: colors.textMuted, fontSize: 17 }}>{placeholder}</Text>
    </View>
  );
}

export function Money({ value, currency = '₽', tone, size = 18 }: { value: number; currency?: string; tone?: 'income' | 'expense'; size?: number }) {
  const color = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.text;
  const sign = tone === 'income' ? '+' : tone === 'expense' ? '−' : '';
  return (
    <Text style={{ color, fontWeight: '900', fontSize, letterSpacing: -0.4 }}>
      {sign}
      {new Intl.NumberFormat('ru-RU').format(Math.abs(value))} {currency}
    </Text>
  );
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Chip({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing(2.5),
    borderWidth: 0,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  softCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.xl,
    padding: spacing(2.25),
    borderWidth: 0,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(1.45),
    paddingHorizontal: spacing(2.25),
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonGhost: { backgroundColor: colors.chip, shadowOpacity: 0 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonYellow: { backgroundColor: colors.accent },
  buttonText: { color: colors.primaryText, fontWeight: '800', fontSize: 16 },
  label: { color: colors.textMuted, marginBottom: 8, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.65),
    color: colors.text,
    borderWidth: 0,
    fontSize: 16,
  },
  search: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.chip,
    paddingHorizontal: spacing(1.75),
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1.5),
  },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', marginBottom: spacing(1.5), letterSpacing: -1.2 },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing(1.7),
    paddingVertical: spacing(1),
    borderRadius: radius.xl,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  chipTextActive: { color: colors.primaryText },
});
