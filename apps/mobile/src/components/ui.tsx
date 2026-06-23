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

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isGhost && styles.buttonGhost,
        isDanger && styles.buttonDanger,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.99 }], opacity: 0.9 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, isGhost && { color: colors.primary }]}>{title}</Text>
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

export function Money({ value, currency = '₽', tone }: { value: number; currency?: string; tone?: 'income' | 'expense' }) {
  const color = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.text;
  const sign = tone === 'income' ? '+' : tone === 'expense' ? '−' : '';
  return (
    <Text style={{ color, fontWeight: '800', fontSize: 18 }}>
      {sign}
      {new Intl.NumberFormat('ru-RU').format(Math.abs(value))} {currency}
    </Text>
  );
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(1.75),
    paddingHorizontal: spacing(2),
    borderRadius: radius.lg,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  buttonGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0 },
  buttonDanger: { backgroundColor: colors.expense, shadowColor: colors.expense },
  buttonText: { color: colors.primaryText, fontWeight: '800', fontSize: 16 },
  label: { color: colors.textMuted, marginBottom: 6, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.55),
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: spacing(2), letterSpacing: -0.5 },
});
