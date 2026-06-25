import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { useAuth } from '../store/auth';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';
import { countOccurrences, scheduledAmount } from '../utils/schedule';

type IncomeViewMode = 'SHARED' | 'MINE' | 'PARTNERS';

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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function moveWeekendToPreviousWorkday(date: Date) {
  const copy = new Date(date);
  if (copy.getDay() === 6) copy.setDate(copy.getDate() - 1);
  if (copy.getDay() === 0) copy.setDate(copy.getDate() - 2);
  return copy;
}

function periodLabel(item: any) {
  const text = String(item?.description ?? '');
  const custom = text.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (custom) {
    const interval = Number(custom[1]);
    const unit = custom[2];
    if (unit === 'DAY') return interval === 1 ? 'каждый день' : `каждые ${interval} дн.`;
    if (unit === 'WEEK') return interval === 1 ? 'каждую неделю' : `каждые ${interval} нед.`;
    return interval === 1 ? 'каждый месяц' : `каждые ${interval} мес.`;
  }
  if (item?.recurrence === 'WEEKLY') return 'каждую неделю';
  if (item?.recurrence === 'TWICE_A_MONTH') return '2 раза в месяц';
  if (item?.recurrence === 'MONTHLY') return 'каждый месяц';
  if (item?.recurrence === 'ONE_TIME') return 'разово';
  return null;
}

function addPeriod(date: Date, item: any) {
  const next = new Date(date);
  const text = String(item?.description ?? '');
  const custom = text.match(/\[period:(\d+):(DAY|WEEK|MONTH)\]/);
  if (custom) {
    const interval = Number(custom[1]);
    const unit = custom[2];
    if (unit === 'DAY') next.setDate(next.getDate() + interval);
    else if (unit === 'WEEK') next.setDate(next.getDate() + interval * 7);
    else next.setMonth(next.getMonth() + interval);
    return next;
  }
  if (item?.recurrence === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (item?.recurrence === 'TWICE_A_MONTH') next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function nearestDate(item: any, start: Date, end: Date) {
  let cursor = new Date(item?.date ?? new Date());
  if (item?.recurrence === 'ONE_TIME') return cursor >= start && cursor < end ? cursor : null;
  let guard = 0;
  while (cursor < end && guard < 500) {
    if (cursor >= start) return cursor;
    cursor = addPeriod(cursor, item);
    guard += 1;
  }
  return null;
}

function isConfirmed(item: any, date: Date) {
  return String(item?.description ?? '').includes(`[confirmed:${dateKey(date)}]`);
}

export default function IncomesScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const currentUserId = useAuth((state) => state.user?.id);
  const [items, setItems] = useState<any[]>([]);
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [viewMode, setViewMode] = useState<IncomeViewMode>('SHARED');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      const response = await api.incomes(selectedId);
      setItems(Array.isArray(response) ? response : []);
    } catch (e: any) {
      setError(e.message ?? 'Не удалось загрузить доходы');
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const months = useMemo(() => monthOptions(), []);
  const { start, end } = useMemo(() => periodRange(periodMode, selectedMonth), [periodMode, selectedMonth]);

  const partners = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (item?.user?.id && item.user.id !== currentUserId) map.set(item.user.id, item.user.name ?? 'Партнёр');
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items, currentUserId]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const count = countOccurrences({ startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end });
    if (count <= 0) return false;
    if (viewMode === 'SHARED') return true;
    if (viewMode === 'MINE') return !item.user?.id || item.user.id === currentUserId;
    if (!item.user?.id || item.user.id === currentUserId) return false;
    return selectedPartnerId ? item.user.id === selectedPartnerId : true;
  }), [items, start, end, viewMode, currentUserId, selectedPartnerId]);

  const total = useMemo(() => visibleItems.reduce((sum, item) => sum + scheduledAmount({ amount: item.amount, startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end }), 0), [visibleItems, start, end]);

  const dueIncome = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return items.find((item) => {
      if (item?.user?.id && item.user.id !== currentUserId) return false;
      const due = nearestDate(item, new Date(now.getFullYear(), now.getMonth(), 1), todayEnd);
      if (!due) return false;
      const actualDue = moveWeekendToPreviousWorkday(due);
      return actualDue <= todayStart && !isConfirmed(item, actualDue);
    });
  }, [items, currentUserId]);

  const confirmIncome = async (item: any) => {
    const now = new Date();
    const due = nearestDate(item, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const actualDue = moveWeekendToPreviousWorkday(due ?? now);
    setBusyId(item.id);
    try {
      const description = `${item.description ?? ''} [confirmed:${dateKey(actualDue)}]`.trim();
      await request(`/incomes/${item.id}`, { method: 'PATCH', body: { description } });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const removeIncome = async (item: any) => {
    setBusyId(item.id);
    try {
      await request(`/incomes/${item.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!selectedId) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}><ScreenTitle>Доходы</ScreenTitle><Card><Text style={{ color: colors.text }}>Личный профиль загружается. Обновите экран через пару секунд.</Text></Card></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Общие, мои и партнёрские поступления">Доходы</ScreenTitle>
        <Pressable onPress={() => navigation.navigate('AddIncome')} style={({ pressed }) => [{ height: 42, paddingHorizontal: spacing(1.5), borderRadius: radius.pill, backgroundColor: colors.accent, justifyContent: 'center' }, pressed && { opacity: 0.86 }]}>
          <Text style={{ color: colors.accentText, fontFamily: appFont, fontWeight: '600' }}>+ Добавить</Text>
        </Pressable>
      </View>

      {dueIncome ? <Card style={{ marginBottom: spacing(1.5), borderColor: colors.warning }}>
        <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>Подтвердить доход?</Text>
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>{INCOME_TYPE[dueIncome.type] ?? dueIncome.type} · {new Intl.NumberFormat('ru-RU').format(Math.round(Number(dueIncome.amount)))} ₽</Text>
        <View style={{ marginTop: spacing(1) }}><Button title="Подтверждаю поступление" onPress={() => confirmIncome(dueIncome)} loading={busyId === dueIncome.id} /></View>
      </Card> : null}

      <View style={{ gap: spacing(1), marginBottom: spacing(1.5) }}>
        <SegmentedControl value={viewMode} onChange={setViewMode} options={[{ label: 'Общие', value: 'SHARED' }, { label: 'Мои', value: 'MINE' }, { label: 'Партнёры', value: 'PARTNERS' }]} />
        <SegmentedControl value={periodMode} onChange={setPeriodMode} options={[{ label: 'Месяц', value: 'MONTH' }, { label: 'Год', value: 'YEAR' }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1), paddingBottom: spacing(0.5) }}>{months.map((m) => <Chip key={m.key} label={m.label} active={selectedMonth === m.key} onPress={() => setSelectedMonth(m.key)} />)}</ScrollView>
      </View>

      {viewMode === 'PARTNERS' && partners.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(1.5) }}>
        <Chip label="Все партнёры" active={selectedPartnerId === null} onPress={() => setSelectedPartnerId(null)} />
        {partners.map((partner) => <Chip key={partner.id} label={partner.name} active={selectedPartnerId === partner.id} onPress={() => setSelectedPartnerId(partner.id)} />)}
      </View> : null}

      <View style={{ minHeight: 52, marginBottom: spacing(1.5) }}><PortfolioPicker /></View>

      <Card style={{ marginBottom: spacing(1.5) }}>
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13 }}>Доходы · {periodMode === 'MONTH' ? 'месяц' : 'год'}</Text>
        <Text style={{ color: colors.income, fontFamily: appFont, fontSize: 30, fontWeight: '600', marginTop: 6 }}>+{new Intl.NumberFormat('ru-RU').format(Math.round(total))} ₽</Text>
      </Card>

      {error ? <Text style={{ color: colors.expense, marginBottom: spacing(1) }}>{error}</Text> : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing(12) }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, marginTop: spacing(2), fontFamily: appFont }}>Доходов в выбранном периоде пока нет.</Text>}
        renderItem={({ item }) => {
          const count = countOccurrences({ startDate: item.date, recurrence: item.recurrence, marker: item.description, rangeStart: start, rangeEnd: end });
          const amount = periodMode === 'YEAR' ? Number(item.amount) * count : Number(item.amount);
          const nearest = nearestDate(item, start, end);
          return <Card style={{ marginBottom: spacing(1.25), opacity: busyId === item.id ? 0.55 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <IconBubble name="income" color={colors.income} bg={colors.mintSoft} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>{INCOME_TYPE[item.type] ?? item.type}</Text>
                <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 4 }}>Ближайшая: {nearest ? nearest.toLocaleDateString('ru-RU') : new Date(item.date).toLocaleDateString('ru-RU')}{periodLabel(item) ? ` · ${periodLabel(item)}` : ''}{item.user?.name ? ` · ${item.user.name}` : ''}{periodMode === 'YEAR' && count > 1 ? ` · ${count} выплат · ${new Intl.NumberFormat('ru-RU').format(Math.round(Number(item.amount)))} ₽` : ''}</Text>
              </View>
              <Text style={{ color: colors.income, fontFamily: appFont, fontWeight: '600', fontSize: 16 }}>+{new Intl.NumberFormat('ru-RU').format(Math.round(amount))} ₽</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
              <Pressable onPress={() => navigation.navigate('AddIncome', { income: item })} disabled={busyId === item.id} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '500' }}>Изменить</Text></Pressable>
              <Pressable onPress={() => removeIncome(item)} disabled={busyId === item.id} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '500' }}>Удалить</Text></Pressable>
            </View>
          </Card>;
        }}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75), borderRadius: radius.pill, backgroundColor: active ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}><Text style={{ color: active ? colors.primary : colors.text, fontFamily: appFont, fontWeight: '600', fontSize: 12 }}>{label}</Text></Pressable>;
}
