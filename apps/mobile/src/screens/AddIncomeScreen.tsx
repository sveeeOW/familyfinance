import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const INCOME_TYPES = [
  { key: 'SALARY', label: 'Зарплата' },
  { key: 'ADVANCE', label: 'Аванс' },
  { key: 'BONUS', label: 'Премия' },
  { key: 'DIVIDENDS', label: 'Дивиденды' },
  { key: 'INVESTMENT', label: 'Инвестиции' },
  { key: 'DEPOSIT_INTEREST', label: 'Проценты' },
  { key: 'DEBT_RETURN', label: 'Возврат долга' },
  { key: 'GIFT', label: 'Подарок' },
  { key: 'SIDE_JOB', label: 'Подработка' },
  { key: 'OTHER', label: 'Другое' },
];

const PERIODS = [
  { key: 'ONE_TIME', label: 'Разово', recurrence: 'ONE_TIME' },
  { key: 'WEEKLY', label: 'Каждую неделю', recurrence: 'WEEKLY' },
  { key: 'TWO_WEEKS', label: 'Каждые 2 недели', recurrence: 'CUSTOM', interval: 2, unit: 'WEEK' },
  { key: 'THREE_WEEKS', label: 'Каждые 3 недели', recurrence: 'CUSTOM', interval: 3, unit: 'WEEK' },
  { key: 'MONTHLY', label: 'Каждый месяц', recurrence: 'MONTHLY' },
  { key: 'FOUR_MONTHS', label: 'Каждые 4 месяца', recurrence: 'CUSTOM', interval: 4, unit: 'MONTH' },
  { key: 'SIX_MONTHS', label: 'Полгода', recurrence: 'CUSTOM', interval: 6, unit: 'MONTH' },
  { key: 'CUSTOM', label: 'Свой период', recurrence: 'CUSTOM' },
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

function getCustom(description?: string | null) {
  const match = description?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (!match) return null;
  return { interval: Number(match[1]), unit: match[2] };
}

function periodKeyFromIncome(income: any) {
  if (!income) return 'MONTHLY';
  if (income.recurrence === 'WEEKLY') return 'WEEKLY';
  if (income.recurrence === 'MONTHLY') return 'MONTHLY';
  if (income.recurrence === 'ONE_TIME') return 'ONE_TIME';
  const custom = getCustom(income.description);
  if (custom?.unit === 'WEEK' && custom.interval === 2) return 'TWO_WEEKS';
  if (custom?.unit === 'WEEK' && custom.interval === 3) return 'THREE_WEEKS';
  if (custom?.unit === 'MONTH' && custom.interval === 4) return 'FOUR_MONTHS';
  if (custom?.unit === 'MONTH' && custom.interval === 6) return 'SIX_MONTHS';
  return 'CUSTOM';
}

function periodPayload(periodKey: string, customInterval: string, customUnit: string) {
  const preset = PERIODS.find((period) => period.key === periodKey);
  if (!preset) return { error: 'Выберите период' };

  if (periodKey !== 'CUSTOM') {
    const interval = preset.interval;
    const unit = preset.unit;
    return {
      recurrence: preset.recurrence,
      description: interval && unit ? `Период: ${customLabel(interval, unit)} [period:${interval}:${unit}]` : undefined,
    };
  }

  const interval = Number(customInterval);
  if (!Number.isInteger(interval) || interval <= 0) {
    return { error: 'Укажите период целым числом: например 2 недели или 15 дней' };
  }
  return {
    recurrence: 'CUSTOM',
    description: `Период: ${customLabel(interval, customUnit)} [period:${interval}:${customUnit}]`,
  };
}

export default function AddIncomeScreen({ navigation, route }: any) {
  const income = route?.params?.income;
  const isEditing = Boolean(income?.id);
  const { selectedId } = usePortfolios();
  const savedCustom = useMemo(() => getCustom(income?.description), [income]);
  const [amount, setAmount] = useState(income ? String(Number(income.amount)) : '');
  const [type, setType] = useState(income?.type ?? 'SALARY');
  const [period, setPeriod] = useState(periodKeyFromIncome(income));
  const [nearestPayout, setNearestPayout] = useState(income?.date ? new Date(income.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [paymentDay, setPaymentDay] = useState(income?.paymentDay ? String(income.paymentDay) : '');
  const [customInterval, setCustomInterval] = useState(savedCustom?.interval ? String(savedCustom.interval) : '2');
  const [customUnit, setCustomUnit] = useState(savedCustom?.unit ?? 'WEEK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!value || value <= 0) {
      setError('Введите сумму');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nearestPayout)) {
      setError('Укажите ближайшую выплату в формате YYYY-MM-DD');
      return;
    }
    const periodData = periodPayload(period, customInterval, customUnit);
    if ('error' in periodData) {
      setError(periodData.error);
      return;
    }
    if (!selectedId && !isEditing) return;
    setBusy(true);
    try {
      const body = {
        type,
        amount: value,
        date: nearestPayout,
        recurrence: periodData.recurrence,
        paymentDay: paymentDay ? Number(paymentDay) : Number(nearestPayout.slice(8, 10)),
        description: periodData.description,
      };

      if (isEditing) {
        await request(`/incomes/${income.id}`, { method: 'PATCH', body });
      } else {
        await api.createIncome({ portfolioId: selectedId, ...body });
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const removeIncome = () => {
    if (!income?.id) return;
    Alert.alert('Удалить доход?', 'Запись будет удалена из портфеля.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await request(`/incomes/${income.id}`, { method: 'DELETE' });
            navigation.goBack();
          } catch (e: any) {
            setError(e.message ?? 'Не удалось удалить');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>{isEditing ? 'Редактировать доход' : 'Новый доход'}</ScreenTitle>
      <Field label="Сумма, ₽" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="225000" />
      <Field label="Ближайшая выплата" value={nearestPayout} onChangeText={setNearestPayout} placeholder="2026-07-05" />

      <Text style={label}>Тип дохода</Text>
      <Chips options={INCOME_TYPES} value={type} onChange={setType} />

      <Text style={[label, { marginTop: spacing(2) }]}>Период</Text>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />

      {period === 'CUSTOM' ? (
        <View style={{ marginTop: spacing(1.5) }}>
          <Field label="Повторять каждые" keyboardType="numeric" value={customInterval} onChangeText={setCustomInterval} placeholder="2" />
          <Chips options={UNIT_OPTIONS} value={customUnit} onChange={setCustomUnit} />
        </View>
      ) : null}

      {period !== 'ONE_TIME' ? (
        <View style={{ marginTop: spacing(2) }}>
          <Field
            label="День получения (1–31, опц.)"
            keyboardType="numeric"
            value={paymentDay}
            onChangeText={setPaymentDay}
            placeholder={nearestPayout.slice(8, 10)}
          />
        </View>
      ) : null}

      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing(1) }}>
        Ближайшая выплата — это старт расписания. Для регулярных доходов приложение будет учитывать следующие выплаты автоматически в будущих месяцах.
      </Text>

      {error ? <Text style={{ color: colors.expense, marginVertical: spacing(1) }}>{error}</Text> : null}
      <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
        <Button title={isEditing ? 'Сохранить изменения' : 'Сохранить доход'} onPress={submit} loading={busy} />
        {isEditing ? <Button title="Удалить доход" onPress={removeIncome} variant="danger" disabled={busy} /> : null}
      </View>
    </ScrollView>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
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

const label = { color: colors.textMuted, marginBottom: 6, fontSize: 13, fontWeight: '700' } as const;
