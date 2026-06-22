import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { usePortfolios } from '../store/portfolio';
import { ScreenTitle } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, spacing } from '../theme';

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

export default function IncomesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.incomes(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <ScreenTitle>Доходы</ScreenTitle>
      <PortfolioPicker />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        style={{ marginTop: spacing(1) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2) }}>Доходов пока нет.</Text>}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing(1.5),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {INCOME_TYPE[item.type] ?? item.type}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.user?.name ? `${item.user.name} · ` : ''}
                {new Date(item.date).toLocaleDateString('ru-RU')}
              </Text>
            </View>
            <Text style={{ color: colors.income, fontWeight: '700' }}>
              +{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
            </Text>
          </View>
        )}
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
};
