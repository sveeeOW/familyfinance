import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { Category } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Field, ScreenTitle } from '../components/ui';
import { CategorySelector } from '../components/CategorySelector';
import { colors, radius, spacing } from '../theme';

const PERIODS = [
  { key: 'ONE_TIME', label: 'Разово' },
  { key: 'WEEKLY', label: 'Каждую неделю' },
  { key: 'TWO_WEEKS', label: 'Каждые 2 недели', interval: 2, unit: 'WEEK' },
  { key: 'THREE_WEEKS', label: 'Каждые 3 недели', interval: 3, unit: 'WEEK' },
  { key: 'MONTHLY', label: 'Каждый месяц' },
  { key: 'THREE_MONTHS', label: 'Каждые 3 месяца', interval: 3, unit: 'MONTH' },
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

function periodNote(periodKey: string, customInterval: string, customUnit: string, anchorDate: string) {
  if (periodKey === 'ONE_TIME') return undefined;
  if (periodKey === 'WEEKLY') return `Период: каждую неделю [anchor:${anchorDate}]`;
  if (periodKey === 'MONTHLY') return `Период: каждый месяц [anchor:${anchorDate}]`;

  const preset = PERIODS.find((period) => period.key === periodKey) as any;
  if (periodKey !== 'CUSTOM' && preset?.interval && preset?.unit) {
    return `Период: ${customLabel(preset.interval, preset.unit)} [period:${preset.interval}:${preset.unit}] [anchor:${anchorDate}]`;
  }

  const interval = Number(customInterval);
  if (!Number.isInteger(interval) || interval <= 0) {
    return { error: 'Укажите период целым числом: например 2 недели или 15 дней' };
  }
  return `Период: ${customLabel(interval, customUnit)} [period:${interval}:${customUnit}] [anchor:${anchorDate}]`;
}

function periodFromComment(comment?: string | null) {
  if (!comment?.startsWith('Период: ')) return { key: 'ONE_TIME', interval: '2', unit: 'WEEK' };
  if (comment.includes('каждую неделю')) return { key: 'WEEKLY', interval: '2', unit: 'WEEK' };
  if (comment.includes('каждый месяц')) return { key: 'MONTHLY', interval: '2', unit: 'WEEK' };
  const tag = comment.split('[period:')[1]?.split(']')[0];
  if (!tag) return { key: 'CUSTOM', interval: '2', unit: 'WEEK' };
  const [interval, unit] = tag.split(':');
  if (unit === 'WEEK' && interval === '2') return { key: 'TWO_WEEKS', interval, unit };
  if (unit === 'WEEK' && interval === '3') return { key: 'THREE_WEEKS', interval, unit };
  if (unit === 'MONTH' && interval === '3') return { key: 'THREE_MONTHS', interval, unit };
  if (unit === 'MONTH' && interval === '4') return { key: 'FOUR_MONTHS', interval, unit };
  if (unit === 'MONTH' && interval === '6') return { key: 'SIX_MONTHS', interval, unit };
  return { key: 'CUSTOM', interval: interval || '2', unit: unit || 'WEEK' };
}

export default function AddExpenseScreen({ navigation, route }: any) {
  const expense = route?.params?.expense;
  const isEditing = Boolean(expense?.id);
  const { selectedId } = usePortfolios();
  const savedPeriod = periodFromComment(expense?.comment);
  const [amount, setAmount] = useState(expense ? String(Number(expense.amount)) : '');
  const [title, setTitle] = useState(expense?.title ?? expense?.merchant ?? '');
  const [date, setDate] = useState(expense?.date ? new Date(expense.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? expense?.category?.id ?? null);
  const [scope, setScope] = useState<'PERSONAL' | 'SHARED'>(expense?.scope ?? 'PERSONAL');
  const [period, setPeriod] = useState(savedPeriod.key);
  const [customInterval, setCustomInterval] = useState(savedPeriod.interval);
  const [customUnit, setCustomUnit] = useState(savedPeriod.unit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pid = selectedId ?? expense?.portfolioId;
    if (pid) api.categories(pid).then(setCategories).catch(() => {});
  }, [selectedId, expense?.portfolioId]);

  const submit = useCallback(async () => {
    setError(null);
    const value = Number(amount.replace(',', '.'));
    if (!value || value <= 0) {
      setError('Введите сумму');
      return;
    }
    const note = periodNote(period, customInterval, customUnit, date);
    if (typeof note === 'object' && note?.error) {
      setError(note.error);
      return;
    }
    if (!selectedId && !isEditing) return;
    setBusy(true);
    try {
      const body = {
        amount: value,
        date,
        title: title || undefined,
        merchant: title || undefined,
        categoryId: categoryId ?? undefined,
        scope,
        comment: typeof note === 'string' ? note : undefined,
      };

      if (isEditing) {
        await request(`/expenses/${expense.id}`, { method: 'PATCH', body });
      } else {
        await api.createExpense({ portfolioId: selectedId, ...body });
        if (period !== 'ONE_TIME') {
          await request('/recurring-payments', {
            method: 'POST',
            body: {
              portfolioId: selectedId,
              title: title || 'Регулярный расход',
              amount: value,
              categoryId: categoryId ?? undefined,
              paymentDay: Math.max(1, Math.min(31, Number(date.slice(8, 10)) || new Date().getDate())),
              recurrence: period === 'WEEKLY' ? 'WEEKLY' : period === 'MONTHLY' ? 'MONTHLY' : 'CUSTOM',
              comment: typeof note === 'string' ? `${note}; создано из расхода` : 'Создано из расхода',
            },
          });
        }
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [amount, title, date, categoryId, scope, selectedId, navigation, period, customInterval, customUnit, isEditing, expense?.id]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>{isEditing ? 'Редактировать расход' : 'Новый расход'}</ScreenTitle>
      <Field label="Сумма, ₽" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" />
      <Field label="Описание / продавец" value={title} onChangeText={setTitle} placeholder="Перекрёсток" />
      <Field label="Дата списания" value={date} onChangeText={setDate} placeholder="2026-06-23" />

      <Text style={{ color: colors.textMuted, marginBottom: 6, fontWeight: '700' }}>Куда добавить расход</Text>
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
            <Text style={{ color: scope === s ? colors.primary : colors.text, fontWeight: '800' }}>{s === 'SHARED' ? 'В общий портфель' : 'В мои'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.textMuted, marginTop: -spacing(1), marginBottom: spacing(2), fontSize: 12 }}>
        По умолчанию расходы добавляются в “Мои”. Общий портфель нужен для расходов, которые должны участвовать в совместном расчёте.
      </Text>

      <CategorySelector
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        onAddPress={() => navigation.navigate('Categories')}
      />

      <Text style={{ color: colors.textMuted, marginBottom: 6, fontWeight: '700' }}>Период расхода</Text>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {period === 'CUSTOM' ? (
        <View style={{ marginTop: spacing(1.5) }}>
          <Field label="Повторять каждые" keyboardType="numeric" value={customInterval} onChangeText={setCustomInterval} placeholder="2" />
          <Chips options={UNIT_OPTIONS} value={customUnit} onChange={setCustomUnit} />
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.expense, marginBottom: spacing(1), marginTop: spacing(1) }}>{error}</Text> : null}
      <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
        <Button title={isEditing ? 'Сохранить изменения' : 'Сохранить расход'} onPress={submit} loading={busy} />
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
