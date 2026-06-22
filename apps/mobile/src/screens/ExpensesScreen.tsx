import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { ScreenTitle } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

const STATUS_LABEL: Record<Expense['status'], { text: string; color: string }> = {
  CONFIRMED: { text: '', color: colors.textMuted },
  PENDING: { text: 'ожидает', color: colors.warning },
  NEEDS_CLARIFICATION: { text: 'уточнить', color: colors.warning },
  RECOGNITION_ERROR: { text: 'ошибка', color: colors.expense },
};

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
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2) }}>Расходов пока нет.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          return (
            <View style={rowStyle}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), flex: 1 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.category?.color ?? colors.primary }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {item.title ?? item.merchant ?? item.category?.name ?? 'Расход'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {item.category?.name ?? 'Без категории'} · {new Date(item.date).toLocaleDateString('ru-RU')}
                    {status.text ? ` · ${status.text}` : ''}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.expense, fontWeight: '700' }}>
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

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
};

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
};
