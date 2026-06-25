import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { useAuth } from '../store/auth';
import { usePortfolios } from '../store/portfolio';
import { Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';
import { countOccurrences, scheduledAmount } from '../utils/schedule';

const INCOME_TYPE: Record<string, string> = { SALARY: 'Зарплата', ADVANCE: 'Аванс', BONUS: 'Премия', DIVIDENDS: 'Дивиденды', INVESTMENT: 'Инвестиции', DEPOSIT_INTEREST: 'Проценты по вкладу', DEBT_RETURN: 'Возврат долга', GIFT: 'Подарок', SIDE_JOB: 'Подработка', OTHER: 'Другое' };
type IncomeViewMode = 'SHARED' | 'MINE' | 'PARTNERS';

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function monthOptions() { const now = new Date(); return Array.from({ length: 13 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - index, 1); return { key: monthKey(date), label: date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) }; }); }
function periodRange(periodMode: 'MONTH' | 'YEAR', selectedMonth: string) { const [year, month] = selectedMonth.split('-').map(Number); const base = new Date(year, month - 1, 1); if (periodMode === 'YEAR') return { start: new Date(base.getFullYear(), 0, 1), end: new Date(base.getFullYear() + 1, 0, 1) }; return { start: base, end: new Date(base.getFullYear(), base.getMonth() + 1, 1) }; }
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function workdayBeforeWeekend(date: Date) { const copy = new Date(date); const day = copy.getDay(); if (day === 6) copy.setDate(copy.getDate() - 1); if (day === 0) copy.setDate(copy.getDate() - 2); return copy; }
function plural(n: number, forms: [string, string, string]) { const abs = Math.abs(n) % 100; const last = abs % 10; if (abs > 10 && abs < 20) return forms[2]; if (last > 1 && last < 5) return forms[1]; if (last === 1) return forms[0]; return forms[2]; }
function customPeriodLabel(description?: string | null) { const match = description?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/); if (!match) return null; const interval = Number(match[1]); const unit = match[2]; if (unit === 'DAY') return interval === 1 ? 'каждый день' : `каждые ${interval} ${plural(interval, ['день', 'дня', 'дней'])}`; if (unit === 'WEEK') return interval === 1 ? 'каждую неделю' : `каждые ${interval} ${plural(interval, ['неделю', 'недели', 'недель'])}`; return interval === 1 ? 'каждый месяц' : `каждые ${interval} ${plural(interval, ['месяц', 'месяца', 'месяцев'])}`; }
function periodLabel(item: any) { const custom = customPeriodLabel(item.description); if (custom) return custom; if (item.recurrence === 'WEEKLY') return 'каждую неделю'; if (item.recurrence === 'TWICE_A_MONTH') return '2 раза в месяц'; if (item.recurrence === 'MONTHLY') return 'каждый месяц'; if (item.recurrence === 'ONE_TIME') return 'разово'; if (item.recurrence === 'CUSTOM') return 'свой период'; return null; }
function customPeriod(description?: string | null) { const match = description?.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/); if (!match) return null; return { interval: Number(match[1]), unit: match[2] as 'DAY' | 'WEEK' | 'MONTH' }; }
function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
function addMonths(date: Date, months: number) { const copy = new Date(date); copy.setMonth(copy.getMonth() + months); return copy; }
function nextDate(item: any, rangeStart: Date, rangeEnd: Date) { if (item.recurrence === 'ONE_TIME') return new Date(item.date); let cursor = new Date(item.date); const period = customPeriod(item.description); for (let guard = 0; guard < 500 && cursor <= rangeEnd; guard += 1) { if (cursor >= rangeStart && cursor <= rangeEnd) return cursor; if (period?.unit === 'DAY') cursor = addDays(cursor, period.interval); else if (period?.unit === 'WEEK') cursor = addDays(cursor, period.interval * 7); else if (period?.unit === 'MONTH') cursor = addMonths(cursor, period.interval); else if (item.recurrence === 'WEEKLY') cursor = addDays(cursor, 7); else if (item.recurrence === 'TWICE_A_MONTH') cursor = addDays(cursor, 14); else if (item.recurrence === 'MONTHLY') cursor = addMonths(cursor, 1); else break; } return null; }
function confirmedFor(item: any, date: Date) { return typeof item.description === 'string' && item.description.includes(`[confirmed:${dateKey(date)}]`); }

export default function IncomesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const currentUserId = useAuth((state) => state.user?.id);
  const [items, setItems] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [viewMode, setViewMode] = useState<IncomeViewMode>('SHARED');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => { if (!selectedId) return; try { setItems(await api.incomes(selectedId)); } catch { setItems([]); } }, [selectedId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { start, end } = useMemo(() => periodRange(periodMode, selectedMonth), [periodMode, selectedMonth]);
  const months = useMemo(() => monthOptions(), []);
  const partners = useMemo(() => { const map = new Map<string, string>(); items.forEach((item) => { if (item.user?.id && item.user.id !== currentUserId) map.set(item.user.id, item.user.name ?? 'Партнёр'); }); return Array.from(map.entries()).map(([id, name]) => ({ id, name })); }, [items, currentUserId]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (countOccurrences({ startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end }) <= 0) return false;
    if (viewMode === 'SHARED') return true;
    if (viewMode === 'MINE') return !item.user?.id || item.user.id === currentUserId;
    if (!item.user?.id || item.user.id === currentUserId) return false;
    return selectedPartnerId ? item.user.id === selectedPartnerId : true;
  }), [items, start, end, viewMode, currentUserId, selectedPartnerId]);

  const total = useMemo(() => visibleItems.reduce((sum, item) => sum + scheduledAmount({ amount: item.amount, startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end }), 0), [visibleItems, start, end]);

  const dueIncome = useMemo(() => {
    const today = new Date();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return items.find((item) => {
      if (item.user?.id && currentUserId && item.user.id !== currentUserId) return false;
      const due = nextDate(item, new Date(today.getFullYear(), today.getMonth(), 1), todayEnd);
      if (!due) return false;
      const actualDue = workdayBeforeWeekend(due);
      return actualDue < todayEnd && !confirmedFor(item, actualDue);
    });
  }, [items, currentUserId]);

  const confirmIncome = async (item: any) => {
    const due = nextDate(item, new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));
    if (!due) return;
    const actualDue = workdayBeforeWeekend(due);
    const description = `${item.description ?? ''} [confirmed:${dateKey(actualDue)}]`.trim();
    await request(`/incomes/${item.id}`, { method: 'PATCH', body: { description } });
    await load();
  };

  const removeIncome = (item: any) => Alert.alert('Удалить доход?', 'Запись будет удалена из портфеля.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => { setRemovingId(item.id); try { await request(`/incomes/${item.id}`, { method: 'DELETE' }); await load(); } finally { setRemovingId(null); } } }]);

  if (!selectedId) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}><ScreenTitle>Доходы</ScreenTitle><Card><Text style={{ color: colors.text }}>Сначала создайте портфель во вкладке «Портфели».</Text></Card></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Общие, мои и партнёрские поступления">Доходы</ScreenTitle>
        <Pressable onPress={() => navigation.navigate('AddIncome')} style={({ pressed }) => [{ height: 42, paddingHorizontal: spacing(1.5), borderRadius: radius.pill, backgroundColor: colors.accent, justifyContent: 'center' }, pressed && { opacity: 0.86 }]}><Text style={{ color: colors.accentText, fontFamily: appFont, fontWeight: '600' }}>+ Добавить</Text></Pressable>
      </View>

      {dueIncome ? <Card style={{ marginBottom: spacing(1.5), borderColor: colors.warning }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>Подтвердить доход?</Text><Text style={{ color: colors.textMuted, marginTop: 4 }}>Плановое поступление: {INCOME_TYPE[dueIncome.type] ?? dueIncome.type} · {new Intl.NumberFormat('ru-RU').format(Math.round(Number(dueIncome.amount)))} ₽</Text><View style={{ marginTop: spacing(1) }}><Button title="Подтверждаю поступление" onPress={() => confirmIncome(dueIncome)} /></View></Card> : null}

      <View style={{ gap: spacing(1), marginBottom: spacing(1.5) }}>
        <SegmentedControl value={viewMode} onChange={setViewMode} options={[{ label: 'Общие', value: 'SHARED' }, { label: 'Мои', value: 'MINE' }, { label: 'Партнёры', value: 'PARTNERS' }]} />
        <SegmentedControl value={periodMode} onChange={setPeriodMode} options={[{ label: 'Месяц', value: 'MONTH' }, { label: 'Год', value: 'YEAR' }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1) }}>{months.map((m) => <PeriodChip key={m.key} label={m.label} active={selectedMonth === m.key} onPress={() => setSelectedMonth(m.key)} />)}</ScrollView>
      </View>
      {viewMode === 'PARTNERS' && partners.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(1.5) }}><PeriodChip label="Все партнёры" active={selectedPartnerId === null} onPress={() => setSelectedPartnerId(null)} />{partners.map((partner) => <PeriodChip key={partner.id} label={partner.name} active={selectedPartnerId === partner.id} onPress={() => setSelectedPartnerId(partner.id)} />)}</View> : null}
      <PortfolioPicker />

      <Card style={{ marginBottom: spacing(1.5) }}><Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Доходы · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text><Text style={{ color: colors.income, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>+{new Intl.NumberFormat('ru-RU').format(Math.round(total))} ₽</Text></Card>

      <FlatList data={visibleItems} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingBottom: spacing(12) }} ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Доходов в выбранном периоде пока нет.</Text>} renderItem={({ item }) => { const period = periodLabel(item); const occurrenceCount = countOccurrences({ startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end }); const periodAmount = Number(item.amount) * occurrenceCount; const nearest = periodMode === 'YEAR' ? nextDate(item, start, end)?.toLocaleDateString('ru-RU') : new Date(item.date).toLocaleDateString('ru-RU'); return <Card style={{ marginBottom: spacing(1.25) }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}><IconBubble name="income" color={colors.income} bg={colors.mintSoft} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>{INCOME_TYPE[item.type] ?? item.type}</Text><Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>Ближайшая: {nearest ?? '—'}{period ? ` · ${period}` : ''}{item.user?.name ? ` · ${item.user.name}` : ''}{periodMode === 'YEAR' && occurrenceCount > 1 ? ` · ${occurrenceCount} выплат · ${new Intl.NumberFormat('ru-RU').format(Math.round(Number(item.amount)))} ₽` : ''}</Text></View><Text style={{ color: colors.income, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>+{new Intl.NumberFormat('ru-RU').format(Math.round(periodMode === 'YEAR' ? periodAmount : Number(item.amount)))} ₽</Text></View><View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}><Pressable onPress={() => navigation.navigate('AddIncome', { income: item })} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text></Pressable><Pressable onPress={() => removeIncome(item)} disabled={removingId === item.id} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft, opacity: removingId === item.id ? 0.6 : 1 }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>Удалить</Text></Pressable></View></Card>; }} />
    </View>
  );
}

function PeriodChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={{ paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75), borderRadius: radius.pill, backgroundColor: active ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}><Text style={{ color: active ? colors.primary : colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 12 }}>{label}</Text></Pressable>; }
