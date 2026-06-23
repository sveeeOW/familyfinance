import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { AnalyticsSummary } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Chip, Money, ScreenTitle, SearchField, SoftCard } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

export default function DashboardScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [clarifyCount, setClarifyCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [s, f, c] = await Promise.all([
        api.summary(selectedId),
        api.forecast(selectedId),
        api.needsClarification(selectedId),
      ]);
      setSummary(s);
      setForecast(f);
      setClarifyCount(c.length);
    } catch {
      // экран покажет пустое состояние
    }
  }, [selectedId]);

  useFocusEffect(
    useCallback(() => {
      loadPortfolios().then(loadData);
    }, [loadData, loadPortfolios]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const expense = summary?.totalExpense ?? 0;
  const income = summary?.totalIncome ?? 0;
  const balance = summary?.balance ?? 0;
  const freeMoney = summary?.freeMoney ?? 0;
  const obligatory = summary?.obligatoryTotal ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: spacing(2.5), paddingBottom: spacing(12) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={{ paddingTop: spacing(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1) }}>
          <ScreenTitle>Евгений</ScreenTitle>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={{
              backgroundColor: '#8A2BEF',
              borderRadius: radius.xl,
              paddingHorizontal: spacing(1.6),
              paddingVertical: spacing(1),
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>🎁 Бонус</Text>
          </Pressable>
        </View>

        <SearchField />
        <PortfolioPicker />

        <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(1.5) }}>
          <Chip label="Июнь" active />
          <Chip label="Счета и карты" />
          <Chip label="Без переводов" />
        </View>

        <Card style={{ marginBottom: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Money value={expense} size={38} />
              <Text style={{ color: colors.text, fontSize: 17, marginTop: 2 }}>Траты</Text>
            </View>
            <Text style={{ color: colors.textSubtle, fontSize: 28 }}>×</Text>
          </View>

          <View style={{ height: 96, flexDirection: 'row', alignItems: 'flex-end', gap: spacing(1.2), marginTop: spacing(3) }}>
            {[0.08, 0.18, 0.84, 0.12, 0.46, 0.38, 0.04].map((height, idx) => (
              <View
                key={idx}
                style={{
                  flex: 1,
                  height: Math.max(8, 96 * height),
                  borderRadius: 12,
                  backgroundColor: idx === 2 ? colors.primary : '#DDE4EE',
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(0.8), marginTop: spacing(2.5) }}>
            {summary?.byCategory?.slice(0, 6).map((c) => (
              <View key={c.id} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.xl, paddingHorizontal: spacing(1.1), paddingVertical: spacing(0.65) }}>
                <Text style={{ color: colors.textMuted, fontWeight: '800', fontSize: 12 }}>
                  {c.name} {fmt(c.amount)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(1.5) }}>
          <Card style={{ flex: 1 }}>
            <Text style={cardLabel}>Доходы</Text>
            <Money value={income} tone="income" size={22} />
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={cardLabel}>Остаток</Text>
            <Money value={balance} size={22} />
          </Card>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(2) }}>
          <QuickAction icon="→" label="Расход" onPress={() => navigation.navigate('AddExpense')} />
          <QuickAction icon="+" label="Доход" onPress={() => navigation.navigate('AddIncome')} />
          <QuickAction icon="▣" label="Чек" onPress={() => navigation.navigate('ScanReceipt')} />
          <QuickAction icon="•••" label="Ещё" onPress={() => navigation.navigate('Settings')} />
        </View>

        {clarifyCount > 0 ? (
          <Pressable onPress={() => navigation.navigate('Clarification')}>
            <SoftCard style={{ marginBottom: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <View style={iconCircle('#FFF0D6')}><Text style={{ fontSize: 20 }}>?</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 17 }}>Есть расходы для проверки</Text>
                <Text style={{ color: colors.textMuted, marginTop: 3 }}>{clarifyCount} операций требуют уточнения</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 24 }}>›</Text>
            </SoftCard>
          </Pressable>
        ) : null}

        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900', marginBottom: spacing(1.25), letterSpacing: -0.6 }}>Финздоровье</Text>
        <SoftCard style={{ marginBottom: spacing(1.25) }}>
          <MetricRow title="Свободно до конца месяца" value={fmt(freeMoney)} status={freeMoney >= 0 ? 'Уже неплохо' : 'Нужна осторожность'} />
        </SoftCard>
        <SoftCard style={{ marginBottom: spacing(1.25) }}>
          <MetricRow title="Обязательные платежи" value={fmt(obligatory)} status="Под контролем" />
        </SoftCard>
        {forecast ? (
          <SoftCard>
            <MetricRow title="Прогноз на 3 месяца" value={fmt(forecast.forecast?.in3Months)} status="Планируем заранее" />
          </SoftCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: '100%', height: 58, borderRadius: radius.lg, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: 25, fontWeight: '900' }}>{icon}</Text>
      </View>
      <Text style={{ color: colors.text, textAlign: 'center', fontSize: 12, marginTop: 6, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function MetricRow({ title, value, status }: { title: string; value: string; status: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 19 }}>{value}</Text>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, marginTop: 2 }}>{title}</Text>
        <View style={{ backgroundColor: '#E6F8E9', borderRadius: radius.xl, alignSelf: 'flex-start', marginTop: spacing(1), paddingHorizontal: spacing(1), paddingVertical: spacing(0.45) }}>
          <Text style={{ color: colors.income, fontWeight: '900', fontSize: 12 }}>{status}</Text>
        </View>
      </View>
      <View style={{ width: 58, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSubtle, fontSize: 30 }}>▥</Text>
      </View>
    </View>
  );
}

function iconCircle(bg: string) {
  return { width: 52, height: 52, borderRadius: 26, backgroundColor: bg, alignItems: 'center' as const, justifyContent: 'center' as const };
}

const cardLabel = { color: colors.textMuted, fontSize: 15, marginBottom: spacing(0.6), fontWeight: '800' } as const;
const fmt = (n?: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n ?? 0)) + ' ₽';
