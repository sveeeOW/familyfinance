import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

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

function currentRange(periodMode: 'MONTH' | 'YEAR') {
  const now = new Date();
  const start = periodMode === 'YEAR' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = periodMode === 'YEAR' ? new Date(now.getFullYear() + 1, 0, 1) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export default function ExpensesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Expense[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [portfolioMode, setPortfolioMode] = useState<'SHARED' | 'PERSONAL'>('SHARED');

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.expenses(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredItems = useMemo(() => {
    const { start, end } = currentRange(periodMode);
    return items.filter((item) => {
      const date = new Date(item.date);
      const inRange = date >= start && date < end;
      const scope = item.scope ?? 'SHARED';
      return inRange && scope === portfolioMode;
    });
  }, [items, periodMode, portfolioMode]);

  const total = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.amount), 0), [filteredItems]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Фактические и плановые">Расходы</ScreenTitle>
        <Pressable
          onPress={() => navigation.navigate('AddExpense')}
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
            { label: 'Общие', value: 'SHARED' },
            { label: 'Личные', value: 'PERSONAL' },
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
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Расходы · {portfolioMode === 'SHARED' ? 'общие' : 'личные'} · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text>
        <Text style={{ color: colors.expense, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>
          −{new Intl.NumberFormat('ru-RU').format(total)} ₽
        </Text>
      </Card>

      <FlatList
        data={filteredItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: spacing(12) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Расходов пока нет.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          const period = periodLabel(item);
          return (
            <Card style={{ marginBottom: spacing(1.25) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name="expense" color={colors.expense} bg={colors.redSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
                    {item.title ?? item.merchant ?? item.category?.name ?? 'Расход'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>
                    {item.category?.name ?? 'Без категории'} · {new Date(item.date).toLocaleDateString('ru-RU')}
                    {status.text ? ` · ${status.text}` : ''}
                    {period ? ` · ${period}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                  −{new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <Pressable
                  onPress={() => navigation.navigate('AddExpense', { expense: item })}
                  style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}
                >
                  <Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
