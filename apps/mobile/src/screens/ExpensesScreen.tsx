import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { Expense } from '../api/types';
import { useAuth } from '../store/auth';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';
import { countOccurrences, scheduledAmount } from '../utils/schedule';

type ExpenseViewMode = 'SHARED' | 'MINE' | 'PARTNERS';

const STATUS_LABEL: Record<Expense['status'], { text: string; color: string }> = {
  CONFIRMED: { text: '', color: colors.textMuted },
  PENDING: { text: 'ожидает', color: colors.warning },
  NEEDS_CLARIFICATION: { text: 'уточнить', color: colors.warning },
  RECOGNITION_ERROR: { text: 'ошибка', color: colors.expense },
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthOptions() {
  const now = new Date();
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return { key: monthKey(date), label: date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) };
  });
}

function periodRange(periodMode: 'MONTH' | 'YEAR', selectedMonth: string) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const base = new Date(year, month - 1, 1);
  if (periodMode === 'YEAR') return { start: new Date(base.getFullYear(), 0, 1), end: new Date(base.getFullYear() + 1, 0, 1) };
  return { start: base, end: new Date(base.getFullYear(), base.getMonth() + 1, 1) };
}

function periodLabel(item: any) {
  if (typeof item.comment !== 'string') return null;
  if (!item.comment.startsWith('Период: ')) return null;
  return item.comment.replace('Период: ', '').split(' [')[0];
}

function recurrenceForExpense(item: any) {
  if (typeof item.comment !== 'string') return 'ONE_TIME';
  if (item.comment.includes('[period:')) return 'CUSTOM';
  if (item.comment.includes('каждую неделю')) return 'WEEKLY';
  if (item.comment.includes('каждый месяц')) return 'MONTHLY';
  return 'ONE_TIME';
}

function anchorDateFromComment(comment?: string | null) {
  const match = comment?.match(/\[anchor:(\d{4}-\d{2}-\d{2})\]/);
  return match?.[1] ?? null;
}

function customPeriod(comment?: string | null) {
  const match = comment?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (!match) return null;
  return { interval: Number(match[1]), unit: match[2] as 'DAY' | 'WEEK' | 'MONTH' };
}

function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
function addMonths(date: Date, months: number) { const copy = new Date(date); copy.setMonth(copy.getMonth() + months); return copy; }

function nextOccurrenceLabel(item: any, rangeStart: Date, rangeEnd: Date) {
  const recurrence = recurrenceForExpense(item);
  if (recurrence === 'ONE_TIME') return null;
  const anchor = anchorDateFromComment(item.comment) ?? item.date;
  let cursor = new Date(anchor);
  const period = customPeriod(item.comment);
  for (let guard = 0; guard < 500 && cursor <= rangeEnd; guard += 1) {
    if (cursor >= rangeStart && cursor <= rangeEnd) return cursor.toLocaleDateString('ru-RU');
    if (period?.unit === 'DAY') cursor = addDays(cursor, period.interval);
    else if (period?.unit === 'WEEK') cursor = addDays(cursor, period.interval * 7);
    else if (period?.unit === 'MONTH') cursor = addMonths(cursor, period.interval);
    else if (recurrence === 'WEEKLY') cursor = addDays(cursor, 7);
    else if (recurrence === 'MONTHLY') cursor = addMonths(cursor, 1);
    else break;
  }
  return null;
}

export default function ExpensesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const currentUserId = useAuth((state) => state.user?.id);
  const [items, setItems] = useState<Expense[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [viewMode, setViewMode] = useState<ExpenseViewMode>('SHARED');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try { setItems(await api.expenses(selectedId)); } catch { setItems([]); }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const { start, end } = useMemo(() => periodRange(periodMode, selectedMonth), [periodMode, selectedMonth]);
  const months = useMemo(() => monthOptions(), []);

  const partners = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (item.paidBy?.id && item.paidBy.id !== currentUserId) map.set(item.paidBy.id, item.paidBy.name ?? 'Партнёр');
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items, currentUserId]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const occurrences = countOccurrences({ startDate: item.date, recurrence: recurrenceForExpense(item), marker: item.comment, rangeStart: start, rangeEnd: end });
    if (!occurrences) return false;
    const paidByCurrentUser = Boolean(currentUserId && item.paidBy?.id === currentUserId);
    const paidByPartner = Boolean(currentUserId && item.paidBy?.id && item.paidBy.id !== currentUserId);
    if (viewMode === 'SHARED') return (item.scope ?? 'PERSONAL') === 'SHARED';
    if (viewMode === 'MINE') return paidByCurrentUser || !item.paidBy;
    if (!paidByPartner) return false;
    return selectedPartnerId ? item.paidBy?.id === selectedPartnerId : true;
  }), [items, start, end, viewMode, currentUserId, selectedPartnerId]);

  const total = useMemo(() => filteredItems.reduce((sum, item) => sum + scheduledAmount({ amount: item.amount, startDate: item.date, recurrence: recurrenceForExpense(item), marker: item.comment, rangeStart: start, rangeEnd: end }), 0), [filteredItems, start, end]);

  const confirmDelete = useCallback(async (item: Expense) => {
    setDeleteError(null);
    setDeletingId(item.id);
    try {
      await request(`/expenses/${item.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((expense) => expense.id !== item.id));
      setPendingDeleteId(null);
    } catch (e: any) { setDeleteError(e.message ?? 'Не удалось удалить расход.'); }
    finally { setDeletingId(null); }
  }, []);

  const viewLabel = { SHARED: 'общие операции', MINE: 'мои операции', PARTNERS: selectedPartnerId ? `партнёр: ${partners.find((p) => p.id === selectedPartnerId)?.name ?? 'выбранный'}` : 'операции партнёров' }[viewMode];

  if (!selectedId) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}><ScreenTitle>Расходы</ScreenTitle><Card><Text style={{ color: colors.text }}>Сначала создайте портфель во вкладке «Портфели».</Text></Card></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Общие, мои и партнёрские операции">Расходы</ScreenTitle>
        <Pressable onPress={() => navigation.navigate('AddExpense')} style={({ pressed }) => [{ height: 42, paddingHorizontal: spacing(1.5), borderRadius: radius.pill, backgroundColor: colors.accent, justifyContent: 'center' }, pressed && { opacity: 0.86 }]}>
          <Text style={{ color: colors.accentText, fontFamily: appFont, fontWeight: '600' }}>+ Добавить</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing(1), marginBottom: spacing(1.5) }}>
        <SegmentedControl value={viewMode} onChange={setViewMode} options={[{ label: 'Общие', value: 'SHARED' }, { label: 'Мои', value: 'MINE' }, { label: 'Партнёры', value: 'PARTNERS' }]} />
        <SegmentedControl value={periodMode} onChange={setPeriodMode} options={[{ label: 'Месяц', value: 'MONTH' }, { label: 'Год', value: 'YEAR' }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1) }}>
          {months.map((m) => <PeriodChip key={m.key} label={m.label} active={selectedMonth === m.key} onPress={() => setSelectedMonth(m.key)} />)}
        </ScrollView>
      </View>

      {viewMode === 'PARTNERS' && partners.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(1.5) }}>
        <PeriodChip label="Все партнёры" active={selectedPartnerId === null} onPress={() => setSelectedPartnerId(null)} />
        {partners.map((partner) => <PeriodChip key={partner.id} label={partner.name} active={selectedPartnerId === partner.id} onPress={() => setSelectedPartnerId(partner.id)} />)}
      </View> : null}

      <PortfolioPicker />
      <Card style={{ marginBottom: spacing(1.5) }}>
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Расходы · {viewLabel} · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text>
        <Text style={{ color: colors.expense, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>−{new Intl.NumberFormat('ru-RU').format(Math.round(total))} ₽</Text>
      </Card>
      {deleteError ? <Card style={{ marginBottom: spacing(1.25), borderColor: colors.expense }}><Text style={{ color: colors.expense }}>{deleteError}</Text></Card> : null}

      <FlatList data={filteredItems} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingBottom: spacing(12) }} ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Расходов в выбранном периоде пока нет.</Text>} renderItem={({ item }) => {
        const status = STATUS_LABEL[item.status];
        const period = periodLabel(item);
        const occurrenceCount = countOccurrences({ startDate: item.date, recurrence: recurrenceForExpense(item), marker: item.comment, rangeStart: start, rangeEnd: end });
        const periodAmount = Number(item.amount) * occurrenceCount;
        const nearestOccurrence = periodMode === 'YEAR' ? nextOccurrenceLabel(item, start, end) : null;
        const isDeleting = deletingId === item.id;
        const isPendingDelete = pendingDeleteId === item.id;
        const ownerLabel = item.paidBy?.name ? ` · ${item.paidBy.name}` : '';
        const scopeLabel = item.scope === 'SHARED' ? 'общий' : 'мой';
        return <Card style={{ marginBottom: spacing(1.25), opacity: isDeleting ? 0.55 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <IconBubble name="expense" color={colors.expense} bg={colors.redSoft} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>{item.title ?? item.merchant ?? item.category?.name ?? 'Расход'}</Text>
              <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>{item.category?.name ?? 'Без категории'} · {new Date(item.date).toLocaleDateString('ru-RU')} · {scopeLabel}{ownerLabel}{status.text ? ` · ${status.text}` : ''}{period ? ` · ${period}` : ''}{periodMode === 'YEAR' && occurrenceCount > 1 ? ` · ближайшая ${nearestOccurrence ?? '—'} · ${occurrenceCount} платежа · ${new Intl.NumberFormat('ru-RU').format(Math.round(Number(item.amount)))} ₽` : ''}</Text>
            </View>
            <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>−{new Intl.NumberFormat('ru-RU').format(Math.round(periodMode === 'YEAR' ? periodAmount : Number(item.amount)))} ₽</Text>
          </View>
          {isPendingDelete ? <View style={{ marginTop: spacing(1.5), gap: spacing(1) }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600' }}>Удалить этот расход?</Text><View style={{ flexDirection: 'row', gap: spacing(1) }}><Pressable onPress={() => setPendingDeleteId(null)} disabled={isDeleting} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Отмена</Text></Pressable><Pressable onPress={() => confirmDelete(item)} disabled={isDeleting} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>{isDeleting ? 'Удаляю…' : 'Да, удалить'}</Text></Pressable></View></View> : <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}><Pressable onPress={() => navigation.navigate('AddExpense', { expense: item })} disabled={isDeleting} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text></Pressable><Pressable onPress={() => { setDeleteError(null); setPendingDeleteId(item.id); }} disabled={isDeleting} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>Удалить</Text></Pressable></View>}
        </Card>;
      }} />
    </View>
  );
}

function PeriodChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75), borderRadius: radius.pill, backgroundColor: active ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}><Text style={{ color: active ? colors.primary : colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 12 }}>{label}</Text></Pressable>;
}
