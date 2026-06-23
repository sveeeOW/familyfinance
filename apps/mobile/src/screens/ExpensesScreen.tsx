import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Card, ScreenTitle } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, spacing } from '../theme';

const STATUS_LABEL: Record<Expense['status'], { text: string; color: string }> = {
  CONFIRMED: { text: '', color: colors.textMuted },
  PENDING: { text: 'ожидает', color: colors.warning },
  NEEDS_CLARIFICATION: { text: 'уточнить', color: colors.warning },
  RECOGNITION_ERROR: { text: 'ошибка', color: colors.expense },
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <ScreenTitle>Расходы</ScreenTitle>
      <PortfolioPicker />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        style={{ marginTop: spacing(1) }}
        contentContainerStyle={{ paddingBottom: spacing(10) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2) }}>Расходов пока нет.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          const period = periodLabel(item);
          return (
            <Card style={{ marginBottom: spacing(1.25) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: item.category?.color ?? colors.primary }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                    {item.title ?? item.merchant ?? item.category?.name ?? 'Расход'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {item.category?.name ?? 'Без категории'} · {new Date(item.date).toLocaleDateString('ru-RU')}
                    {status.text ? ` · ${status.text}` : ''}
                    {period ? ` · ${period}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.expense, fontWeight: '900', fontSize: 17 }}>
                  −{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
                </Text>
              </View>
            </Card>
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
  width: 60,
  height: 60,
  borderRadius: 30,
  backgroundColor: colors.primary,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: colors.primary,
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};
