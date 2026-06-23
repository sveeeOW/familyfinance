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
import { colors, radius, shadows, spacing } from '../theme';
import { Icon } from './icons';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function GlassCard({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.glassCard, style]} {...rest}>
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
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'yellow';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>['name'];
}) {
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  const isYellow = variant === 'yellow';
  const iconColor = isGhost ? colors.primary : isYellow ? colors.accentText : colors.primaryText;

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
        <ActivityIndicator color={iconColor} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75) }}>
          {icon ? <Icon name={icon} size={18} color={iconColor} strokeWidth={2.4} /> : null}
          <Text style={[styles.buttonText, isGhost && { color: colors.primary }, isYellow && { color: colors.accentText }]}>
            {title}
          </Text>
        </View>
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
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.primary}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

export function Money({
  value,
  currency = '₽',
  tone,
  size = 18,
}: {
  value: number;
  currency?: string;
  tone?: 'income' | 'expense';
  size?: number;
}) {
  const color = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.text;
  const sign = tone === 'income' ? '+' : tone === 'expense' ? '−' : '';
  return (
    <Text style={{ color, fontWeight: '900', fontSize: size, letterSpacing: -0.45 }}>
      {sign}
      {new Intl.NumberFormat('ru-RU').format(Math.abs(value))} {currency}
    </Text>
  );
}

export function ScreenTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing(2) }}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function IconBubble({
  name,
  color = colors.primary,
  bg = colors.primarySoft,
  size = 44,
}: {
  name: React.ComponentProps<typeof Icon>['name'];
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.52)} color={color} />
    </View>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentProps<typeof Icon>['name'];
  tone?: 'default' | 'income' | 'expense' | 'warning' | 'violet';
}) {
  const palette = {
    default: { color: colors.primary, bg: colors.primarySoft },
    income: { color: colors.income, bg: colors.mintSoft },
    expense: { color: colors.expense, bg: colors.redSoft },
    warning: { color: colors.warning, bg: colors.yellowSoft },
    violet: { color: '#7C3AED', bg: colors.violetSoft },
  }[tone];

  return (
    <Card style={{ flex: 1, minHeight: 132 }}>
      <IconBubble name={icon} color={palette.color} bg={palette.bg} size={42} />
      <Text style={styles.metricLabel}>{label}</Text>
      <View>{value}</View>
    </Card>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: spacing(1.25) }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing(2.25),
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  glassCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.xl,
    padding: spacing(2.25),
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(1.55),
    paddingHorizontal: spacing(2),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    ...shadows.floating,
  },
  buttonGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
  buttonDanger: { backgroundColor: colors.expense, shadowColor: colors.expense },
  buttonYellow: { backgroundColor: colors.accent, shadowColor: colors.warning },
  buttonText: { color: colors.primaryText, fontWeight: '900', fontSize: 15, letterSpacing: -0.2 },
  label: { color: colors.textMuted, marginBottom: 7, fontSize: 13, fontWeight: '800' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.55),
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    fontWeight: '600',
  },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.15 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4, fontWeight: '600' },
  metricLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: spacing(1.4), marginBottom: spacing(0.7) },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.45 },
  sectionSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3, fontWeight: '600' },
  pill: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing(1.6),
    paddingVertical: spacing(0.9),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textMuted, fontWeight: '900', fontSize: 13 },
  pillTextActive: { color: colors.primaryText },
});
