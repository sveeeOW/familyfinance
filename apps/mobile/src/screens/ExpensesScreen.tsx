import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Card, Chip, ScreenTitle, SearchField } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

const STATUS_LABEL: Record<Expense['status'], { text: string; color: string }> = {
  CONFIRMED: { text: '', color: colors.textMuted },
  PENDING: { text: 'ожидает', color: colors.warning },
  NEEDS_CLARIFICATION: { text: 'уточнить', color: colors.warning },
  RECOGNITION_ERROR: { text: 'ошибка', color: colors.danger },
};

function periodLabel(item: any) {
  if (typeof item.comment !== 'string') return null;
  if (!item.comment.startsWith('Период: ')) return null;
  return item.comment.replace('Период: ', '').split(' [')[0];
}

export default function ExpensesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Expense[]>([]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.expenses(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.amount), 0), [items]);
  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item.category?.name ?? 'Остальное';
      map.set(key, (map.get(key) ?? 0) + Number(item.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(2.5) }}>
      <ScreenTitle>Платежи</ScreenTitle>
      <SearchField />
      <PortfolioPicker />
      <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(1.5) }}>
        <Chip label="Июнь" active />
        <Chip label="Счета и карты" />
        <Chip label="Без переводов" />
      </View>

      <Card style={{ marginBottom: spacing(1.5) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: -1.4 }}>{fmt(total)}</Text>
            <Text style={{ color: colors.text, fontSize: 17, marginTop: 2 }}>Траты</Text>
          </View>
          <Text style={{ color: colors.textSubtle, fontSize: 28 }}>×</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(0.8), marginTop: spacing(2.2) }}>
          {topCategories.map(([name, amount]) => (
            <View key={name} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.xl, paddingHorizontal: spacing(1.1), paddingVertical: spacing(0.65) }}>
              <Text style={{ color: colors.textMuted, fontWeight: '900', fontSize: 12 }}>{name} {fmt(amount)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: spacing(11) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2) }}>Расходов пока нет.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          const period = periodLabel(item);
          const date = new Date(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
          return (
            <View style={{ paddingVertical: spacing(1.2), flexDirection: 'row', alignItems: 'center', gap: spacing(1.4) }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: item.category?.color ?? colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{(item.category?.name ?? item.title ?? 'Р').slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 17 }} numberOfLines={1}>
                  {item.title ?? item.merchant ?? item.category?.name ?? 'Расход'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }} numberOfLines={1}>
                  {item.category?.name ?? 'Без категории'} · {date}
                  {status.text ? ` · ${status.text}` : ''}
                  {period ? ` · ${period}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.expense, fontWeight: '900', fontSize: 17 }}>
                −{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
              </Text>
            </View>
          );
        }}
      />
      <Pressable style={fabStyle} onPress={() => navigation.navigate('AddExpense')}>
        <Text style={{ color: '#fff', fontSize: 28, marginTop: -2 }}>＋</Text>
      </Pressable>
    </View>
  );
}

const fabStyle = {
  position: 'absolute' as const,
  right: spacing(3),
  bottom: spacing(3),
  width: 62,
  height: 62,
  borderRadius: 31,
  backgroundColor: colors.primary,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: colors.primary,
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

const fmt = (n?: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n ?? 0)) + ' ₽';
