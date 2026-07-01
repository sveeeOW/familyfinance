import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { AnalyticsSummary } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Card, ScreenTitle } from '../components/ui';
import { DonutChart, LineChart, MonthPoint, Slice } from '../components/charts';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, spacing } from '../theme';

const FALLBACK_COLORS = ['#4F46E5', '#16A34A', '#F59E0B', '#E11D48', '#0EA5E9', '#9333EA', '#EA580C', '#6B7280'];

export default function AnalyticsScreen() {
  const { selectedId } = usePortfolios();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthPoint[]>([]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [s, m] = await Promise.all([api.summary(selectedId), api.monthly(selectedId)]);
      setSummary(s);
      setMonthly(m as MonthPoint[]);
    } catch {
      // empty
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const slices: Slice[] = (summary?.byCategory ?? []).map((c, i) => ({
    label: c.name,
    value: c.amount,
    color: c.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(20) }}>
      <ScreenTitle>Аналитика</ScreenTitle>
      <PortfolioPicker />

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={[muted, { marginBottom: spacing(1.5) }]}>Расходы по категориям</Text>
        <DonutChart data={slices} />
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={[muted, { marginBottom: spacing(1.5) }]}>Доходы и расходы по месяцам</Text>
        <LineChart data={monthly} />
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={muted}>Личные / общие расходы</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1) }}>
          <Text style={{ color: colors.text }}>Личные: {fmt(summary?.personalExpense)}</Text>
          <Text style={{ color: colors.text }}>Общие: {fmt(summary?.sharedExpense)}</Text>
        </View>
      </Card>

      <Text style={[muted, { marginTop: spacing(2), marginBottom: spacing(1) }]}>Расходы по участникам</Text>
      {summary?.byMember?.length ? (
        summary.byMember.map((mem) => (
          <View
            key={mem.userId}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(0.75) }}
          >
            <Text style={{ color: colors.text }}>{mem.name}</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{fmt(mem.amount)}</Text>
          </View>
        ))
      ) : (
        <Text style={{ color: colors.textMuted }}>Нет данных за месяц.</Text>
      )}
    </ScrollView>
  );
}

const muted = { color: colors.textMuted, fontSize: 13 } as const;
const fmt = (n?: number) => new Intl.NumberFormat('ru-RU').format(n ?? 0) + ' ₽';
