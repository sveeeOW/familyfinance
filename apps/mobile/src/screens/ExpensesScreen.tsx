import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';
import { countOccurrences, getPeriodRange, scheduledAmount } from '../utils/schedule';

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
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [portfolioMode, setPortfolioMode] = useState<'SHARED' | 'PERSONAL'>('SHARED');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.expenses(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { start, end } = useMemo(() => getPeriodRange(periodMode), [periodMode]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const scope = item.scope ?? 'SHARED';
      const occurrences = countOccurrences({
        startDate: item.date,
        recurrence: item.comment?.includes('[period:') ? 'CUSTOM' : 'ONE_TIME',
        marker: item.comment,
        rangeStart: start,
        rangeEnd: end,
      });
      return occurrences > 0 && scope === portfolioMode;
    });
  }, [items, start, end, portfolioMode]);

  const total = useMemo(
    () => filteredItems.reduce((sum, item) => sum + scheduledAmount({
      amount: item.amount,
      startDate: item.date,
      recurrence: item.comment?.includes('[period:') ? 'CUSTOM' : 'ONE_TIME',
      marker: item.comment,
      rangeStart: start,
      rangeEnd: end,
    }), 0),
    [filteredItems, start, end],
  );

  const deleteExpense = useCallback((item: Expense) => {
    Alert.alert('Удалить расход?', 'Запись будет удалена из списка и статистики.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(item.id);
          try {
            await request(`/expenses/${item.id}`, { method: 'DELETE' });
            setItems((current) => current.filter((expense) => expense.id !== item.id));
          } catch (e: any) {
            Alert.alert('Ошибка', e.message ?? 'Не удалось удалить расход');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }, []);

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
          −{new Intl.NumberFormat('ru-RU').format(Math.round(total))} ₽
        </Text>
      </Card>

      <FlatList
        data={filteredItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: spacing(12) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Расходов в выбранном периоде пока нет.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          const period = periodLabel(item);
          const occurrenceCount = countOccurrences({
            startDate: item.date,
            recurrence: item.comment?.includes('[period:') ? 'CUSTOM' : 'ONE_TIME',
            marker: item.comment,
            rangeStart: start,
            rangeEnd: end,
          });
          const periodAmount = Number(item.amount) * occurrenceCount;
          const isDeleting = deletingId === item.id;
          return (
            <Card style={{ marginBottom: spacing(1.25), opacity: isDeleting ? 0.55 : 1 }}>
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
                    {periodMode === 'YEAR' && occurrenceCount > 1 ? ` · ${occurrenceCount} раз` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>
                  −{new Intl.NumberFormat('ru-RU').format(Math.round(periodMode === 'YEAR' ? periodAmount : Number(item.amount)))} ₽
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <Pressable
                  onPress={() => navigation.navigate('AddExpense', { expense: item })}
                  disabled={isDeleting}
                  style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}
                >
                  <Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteExpense(item)}
                  disabled={isDeleting}
                  style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft }}
                >
                  <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>
                    {isDeleting ? 'Удаляю…' : 'Удалить'}
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
