import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { Category } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const PERIODS = [
  { key: 'ONE_TIME', label: 'Разово' },
  { key: 'WEEKLY', label: 'Каждую неделю' },
  { key: 'TWO_WEEKS', label: 'Каждые 2 недели', interval: 2, unit: 'WEEK' },
  { key: 'THREE_WEEKS', label: 'Каждые 3 недели', interval: 3, unit: 'WEEK' },
  { key: 'MONTHLY', label: 'Каждый месяц' },
  { key: 'FOUR_MONTHS', label: 'Каждые 4 месяца', interval: 4, unit: 'MONTH' },
  { key: 'SIX_MONTHS', label: 'Полгода', interval: 6, unit: 'MONTH' },
  { key: 'CUSTOM', label: 'Свой период' },
];

const UNIT_OPTIONS = [
  { key: 'DAY', label: 'дни' },
  { key: 'WEEK', label: 'недели' },
  { key: 'MONTH', label: 'месяцы' },
];

function plural(n: number, forms: [string, string, string]) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function customLabel(interval: number, unit: string) {
  if (unit === 'DAY') return interval === 1 ? 'каждый день' : `каждые ${interval} ${plural(interval, ['день', 'дня', 'дней'])}`;
  if (unit === 'WEEK') return interval === 1 ? 'каждую неделю' : `каждые ${interval} ${plural(interval, ['неделю', 'недели', 'недель'])}`;
  return interval === 1 ? 'каждый месяц' : `каждые ${interval} ${plural(interval, ['месяц', 'месяца', 'месяцев'])}`;
}

function periodNote(periodKey: string, customInterval: string, customUnit: string) {
  if (periodKey === 'ONE_TIME') return undefined;
  if (periodKey === 'WEEKLY') return 'Период: каждую неделю';
  if (periodKey === 'MONTHLY') return 'Период: каждый месяц';

  const preset = PERIODS.find((period) => period.key === periodKey) as any;
  if (periodKey !== 'CUSTOM' && preset?.interval && preset?.unit) {
    return `Период: ${customLabel(preset.interval, preset.unit)} [period:${preset.interval}:${preset.unit}]`;
  }

  const interval = Number(customInterval);
  if (!Number.isInteger(interval) || interval <= 0) {
    return { error: 'Укажите период целым числом: например 2 недели или 15 дней' };
  }
  return `Период: ${customLabel(interval, customUnit)} [period:${interval}:${customUnit}]`;
}

export default function AddExpenseScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scope, setScope] = useState<'PERSONAL' | 'SHARED'>('SHARED');
  const [period, setPeriod] = useState('ONE_TIME');
  const [customInterval, setCustomInterval] = useState('2');
  const [customUnit, setCustomUnit] = useState('WEEK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId) api.categories(selectedId).then(setCategories).catch(() => {});
  }, [selectedId]);

  const submit = useCallback(async () => {
    setError(null);
    const value = Number(amount.replace(',', '.'));
    if (!value || value <= 0) {
      setError('Введите сумму');
      return;
    }
    const note = periodNote(period, customInterval, customUnit);
    if (typeof note === 'object' && note?.error) {
      setError(note.error);
      return;
    }
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.createExpense({
        portfolioId: selectedId,
        amount: value,
        title: title || undefined,
        merchant: title || undefined,
        categoryId: categoryId ?? undefined,
        scope,
        comment: typeof note === 'string' ? note : undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [amount, title, categoryId, scope, selectedId, navigation, period, customInterval, customUnit]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Новый расход</ScreenTitle>
      <Field
        label="Сумма, ₽"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
      />
      <Field label="Описание / продавец" value={title} onChangeText={setTitle} placeholder="Перекрёсток" />

      <Text style={{ color: colors.textMuted, marginBottom: 6, fontWeight: '700' }}>Тип расхода</Text>
      <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(2) }}>
        {(['SHARED', 'PERSONAL'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setScope(s)}
            style={{
              flex: 1,
              padding: spacing(1.5),
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: scope === s ? colors.primary : colors.border,
              backgroundColor: scope === s ? colors.primarySoft : colors.card,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: scope === s ? colors.primary : colors.text, fontWeight: '800' }}>{s === 'SHARED' ? 'Общий' : 'Личный'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, marginBottom: 6, fontWeight: '700' }}>Категория</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(2) }}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={{
              paddingHorizontal: spacing(1.5),
              paddingVertical: spacing(0.75),
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: categoryId === c.id ? (c.color ?? colors.primary) : colors.border,
              backgroundColor: categoryId === c.id ? colors.primarySoft : colors.card,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, marginBottom: 6, fontWeight: '700' }}>Период расхода</Text>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {period === 'CUSTOM' ? (
        <View style={{ marginTop: spacing(1.5) }}>
          <Field label="Повторять каждые" keyboardType="numeric" value={customInterval} onChangeText={setCustomInterval} placeholder="2" />
          <Chips options={UNIT_OPTIONS} value={customUnit} onChange={setCustomUnit} />
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.expense, marginBottom: spacing(1), marginTop: spacing(1) }}>{error}</Text> : null}
      <View style={{ marginTop: spacing(2) }}>
        <Button title="Сохранить расход" onPress={submit} loading={busy} />
      </View>
    </ScrollView>
  );
}

function Chips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: spacing(1.5),
              paddingVertical: spacing(0.85),
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primarySoft : colors.card,
            }}
          >
            <Text style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: '800' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
