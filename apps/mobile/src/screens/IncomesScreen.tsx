import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';
import { countOccurrences, getPeriodRange, scheduledAmount } from '../utils/schedule';

const INCOME_TYPE: Record<string, string> = {
  SALARY: 'Зарплата',
  ADVANCE: 'Аванс',
  BONUS: 'Премия',
  DIVIDENDS: 'Дивиденды',
  INVESTMENT: 'Инвестиции',
  DEPOSIT_INTEREST: 'Проценты по вкладу',
  DEBT_RETURN: 'Возврат долга',
  GIFT: 'Подарок',
  SIDE_JOB: 'Подработка',
  OTHER: 'Другое',
};

function plural(n: number, forms: [string, string, string]) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function customPeriodLabel(description?: string | null) {
  const match = description?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (!match) return null;
  const interval = Number(match[1]);
  const unit = match[2];
  if (unit === 'DAY') return interval === 1 ? 'каждый день' : `каждые ${interval} ${plural(interval, ['день', 'дня', 'дней'])}`;
  if (unit === 'WEEK') return interval === 1 ? 'каждую неделю' : `каждые ${interval} ${plural(interval, ['неделю', 'недели', 'недель'])}`;
  return interval === 1 ? 'каждый месяц' : `каждые ${interval} ${plural(interval, ['месяц', 'месяца', 'месяцев'])}`;
}

function periodLabel(item: any) {
  const custom = customPeriodLabel(item.description);
  if (custom) return custom;
  if (item.recurrence === 'WEEKLY') return 'каждую неделю';
  if (item.recurrence === 'TWICE_A_MONTH') return '2 раза в месяц';
  if (item.recurrence === 'MONTHLY') return 'каждый месяц';
  if (item.recurrence === 'ONE_TIME') return 'разово';
  if (item.recurrence === 'CUSTOM') return 'свой период';
  return null;
}

function anchorDateFromDescription(description?: string | null) {
  const match = description?.match(/\[anchor:(\d{4}-\d{2}-\d{2})\]/);
  return match?.[1] ?? null;
}

function customPeriod(description?: string | null) {
  const match = description?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (!match) return null;
  return { interval: Number(match[1]), unit: match[2] as 'DAY' | 'WEEK' | 'MONTH' };
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function nextOccurrenceLabel(item: any, rangeStart: Date, rangeEnd: Date) {
  if (item.recurrence === 'ONE_TIME') return null;
  const anchor = anchorDateFromDescription(item.description) ?? item.date;
  let cursor = new Date(anchor);
  const period = customPeriod(item.description);
  for (let guard = 0; guard < 500 && cursor <= rangeEnd; guard += 1) {
    if (cursor >= rangeStart && cursor <= rangeEnd) return cursor.toLocaleDateString('ru-RU');
    if (period?.unit === 'DAY') cursor = addDays(cursor, period.interval);
    else if (period?.unit === 'WEEK') cursor = addDays(cursor, period.interval * 7);
    else if (period?.unit === 'MONTH') cursor = addMonths(cursor, period.interval);
    else if (item.recurrence === 'WEEKLY') cursor = addDays(cursor, 7);
    else if (item.recurrence === 'TWICE_A_MONTH') cursor = addDays(cursor, 14);
    else if (item.recurrence === 'MONTHLY') cursor = addMonths(cursor, 1);
    else break;
  }
  return null;
}

export default function IncomesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.incomes(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { start, end } = useMemo(() => getPeriodRange(periodMode), [periodMode]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + scheduledAmount({
      amount: item.amount,
      startDate: item.date,
      recurrence: item.recurrence,
      marker: item.description,
      rangeStart: start,
      rangeEnd: end,
    }), 0),
    [items, start, end],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => countOccurrences({
      startDate: item.date,
      recurrence: item.recurrence,
      marker: item.description,
      rangeStart: start,
      rangeEnd: end,
    }) > 0),
    [items, start, end],
  );

  const removeIncome = (item: any) => {
    Alert.alert('Удалить доход?', 'Запись будет удалена из портфеля.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(item.id);
          try {
            await request(`/incomes/${item.id}`, { method: 'DELETE' });
            await load();
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Личные доходы и плановые поступления">Доходы</ScreenTitle>
        <Pressable
          onPress={() => navigation.navigate('AddIncome')}
          style={({ pressed }) => [
            { height: 42, paddingHorizontal: spacing(1.5), borderRadius: radius.pill, backgroundColor: colors.accent, justifyContent: 'center' },
            pressed && { opacity: 0.86 },
          ]}
        >
          <Text style={{ color: colors.accentText, fontFamily: appFont, fontWeight: '600' }}>+ Добавить</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing(1), marginBottom: spacing(1.5) }}>
        <SegmentedControl
          value={periodMode}
          onChange={setPeriodMode}
          options={[
            { label: 'Месяц', value: 'MONTH' },
            { label: 'Год', value: 'YEAR' },
          ]}
        />
      </View>
      <PortfolioPicker />

      <Card style={{ marginBottom: spacing(1.5) }}>
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Мои плановые доходы · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text>
        <Text style={{ color: colors.income, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>
          +{new Intl.NumberFormat('ru-RU').format(Math.round(total))} ₽
        </Text>
      </Card>

      <FlatList
        data={visibleItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: spacing(12) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Доходов в выбранном периоде пока нет.</Text>}
        renderItem={({ item }) => {
          const period = periodLabel(item);
          const occurrenceCount = countOccurrences({ startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end });
          const periodAmount = Number(item.amount) * occurrenceCount;
          const nearestOccurrence = periodMode === 'YEAR' ? nextOccurrenceLabel(item, start, end) : new Date(item.date).toLocaleDateString('ru-RU');
          return (
            <Card style={{ marginBottom: spacing(1.25) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name="income" color={colors.income} bg={colors.mintSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                    {INCOME_TYPE[item.type] ?? item.type}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>
                    Ближайшая: {nearestOccurrence ?? new Date(item.date).toLocaleDateString('ru-RU')}
                    {period ? ` · ${period}` : ''}
                    {periodMode === 'YEAR' && occurrenceCount > 1 ? ` · ${occurrenceCount} выплат · ${new Intl.NumberFormat('ru-RU').format(Math.round(Number(item.amount)))} ₽` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.income, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                  +{new Intl.NumberFormat('ru-RU').format(Math.round(periodMode === 'YEAR' ? periodAmount : Number(item.amount)))} ₽
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <Pressable
                  onPress={() => navigation.navigate('AddIncome', { income: item })}
                  style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}
                >
                  <Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeIncome(item)}
                  disabled={removingId === item.id}
                  style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft, opacity: removingId === item.id ? 0.6 : 1 }}
                >
                  <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>Удалить</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
