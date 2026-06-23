import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

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

export default function IncomesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [portfolioMode, setPortfolioMode] = useState<'SHARED' | 'PERSONAL'>('SHARED');
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

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.amount), 0), [items]);

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
        <ScreenTitle subtitle="Расписание выплат">Доходы</ScreenTitle>
        <Pressable
          onPress={() => navigation.navigate('AddIncome')}
          style={({ pressed }) => [
            {
              height: 42,
              paddingHorizontal: spacing(1.5),
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
              justifyContent: 'center',
            },
            pressed && { opacity: 0.86 },
          ]}
        >
          <Text style={{ color: colors.accentText, fontFamily: appFont, fontWeight: '600' }}>+ Добавить</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing(1), marginBottom: spacing(1.5) }}>
        <SegmentedControl
          value={portfolioMode}
          onChange={setPortfolioMode}
          options={[
            { label: 'Общий', value: 'SHARED' },
            { label: 'Личный', value: 'PERSONAL' },
          ]}
        />
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
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Плановые доходы · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text>
        <Text style={{ color: colors.income, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>
          +{new Intl.NumberFormat('ru-RU').format(periodMode === 'YEAR' ? total * 12 : total)} ₽
        </Text>
      </Card>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: spacing(12) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Доходов пока нет.</Text>}
        renderItem={({ item }) => {
          const period = periodLabel(item);
          return (
            <Card style={{ marginBottom: spacing(1.25) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name="income" color={colors.income} bg={colors.mintSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                    {INCOME_TYPE[item.type] ?? item.type}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>
                    Ближайшая: {new Date(item.date).toLocaleDateString('ru-RU')}
                    {period ? ` · ${period}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.income, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                  +{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
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
