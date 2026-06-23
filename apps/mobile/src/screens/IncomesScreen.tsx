import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Card, ScreenTitle } from '../components/ui';
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
      <ScreenTitle>Доходы</ScreenTitle>
      <PortfolioPicker />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        style={{ marginTop: spacing(1) }}
        contentContainerStyle={{ paddingBottom: spacing(10) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2) }}>Доходов пока нет.</Text>}
        renderItem={({ item }) => {
          const period = periodLabel(item);
          return (
            <Card style={{ marginBottom: spacing(1.25) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1.5) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>
                    {INCOME_TYPE[item.type] ?? item.type}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {item.user?.name ? `${item.user.name} · ` : ''}
                    {new Date(item.date).toLocaleDateString('ru-RU')}
                    {period ? ` · ${period}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.income, fontWeight: '900', fontSize: 17 }}>
                  +{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <Pressable
                  onPress={() => navigation.navigate('AddIncome', { income: item })}
                  style={{
                    flex: 1,
                    paddingVertical: spacing(1),
                    borderRadius: radius.md,
                    alignItems: 'center',
                    backgroundColor: colors.primarySoft,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>Изменить</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeIncome(item)}
                  disabled={removingId === item.id}
                  style={{
                    flex: 1,
                    paddingVertical: spacing(1),
                    borderRadius: radius.md,
                    alignItems: 'center',
                    backgroundColor: '#FEE2E2',
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    opacity: removingId === item.id ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: colors.expense, fontWeight: '800' }}>Удалить</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
      <Pressable style={fabStyle} onPress={() => navigation.navigate('AddIncome')}>
        <Text style={{ color: '#fff', fontSize: 28, marginTop: -2 }}>＋</Text>
      </Pressable>
    </View>
  );
}

const fabStyle = {
  position: 'absolute' as const,
  right: spacing(3),
  bottom: spacing(3),
  width: 60,
  height: 60,
  borderRadius: 30,
  backgroundColor: colors.income,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: colors.income,
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};
