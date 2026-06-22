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
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.buttonGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'ghost' && { color: colors.text }]}>{title}</Text>
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
    <Text style={{ color, fontWeight: '700', fontSize: 18 }}>
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
    borderRadius: radius.md,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(1.75),
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  label: { color: colors.textMuted, marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.5),
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: spacing(2) },
});
