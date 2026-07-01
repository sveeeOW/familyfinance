import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { AnalyticsSummary } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, Money, ScreenTitle } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, spacing } from '../theme';

export default function DashboardScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [clarifyCount, setClarifyCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);

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

  useFocusEffect(useCallback(() => { loadPortfolios().then(loadData); }, [loadData, loadPortfolios]));

  useEffect(() => {
    if (!editingBalance && summary?.currentBalance != null) setBalanceInput(String(summary.currentBalance));
  }, [summary?.currentBalance, editingBalance]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const saveCurrentBalance = async () => {
    if (!selectedId) return;
    const value = Number(balanceInput.replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(value)) {
      Alert.alert('Остаток', 'Введите сумму числом.');
      return;
    }
    setSavingBalance(true);
    try {
      await api.updatePortfolio(selectedId, { currentBalance: value });
      await loadPortfolios();
      await loadData();
      setEditingBalance(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось сохранить остаток');
    } finally {
      setSavingBalance(false);
    }
  };

  const actualBalance = summary?.availableNow ?? forecast?.actualToDate?.balance ?? summary?.balance ?? 0;
  const futureIncome = summary?.totalIncome ?? forecast?.restOfMonth?.income ?? forecast?.expectedIncome ?? 0;
  const futureExpense = summary?.totalExpense ?? summary?.plannedExpense ?? forecast?.restOfMonth?.expense ?? forecast?.obligatory ?? 0;
  const forecastBalance = futureIncome - futureExpense;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(20) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <ScreenTitle>Главная</ScreenTitle>
      <PortfolioPicker />

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={labelStyle}>Доступная сумма сейчас</Text>
        <Money value={actualBalance} />
        <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>
          Остаток портфеля + доходы, которые уже должны были прийти, минус расходы, которые уже должны были списаться.
        </Text>
        {editingBalance ? (
          <View style={{ marginTop: spacing(1.25) }}>
            <Field label="Текущий остаток на счетах" value={balanceInput} onChangeText={setBalanceInput} keyboardType="decimal-pad" placeholder="Например: 12500" />
            <View style={{ flexDirection: 'row', gap: spacing(1) }}>
              <View style={{ flex: 1 }}><Button title="Отмена" variant="ghost" onPress={() => setEditingBalance(false)} disabled={savingBalance} /></View>
              <View style={{ flex: 1 }}><Button title="Сохранить" onPress={saveCurrentBalance} loading={savingBalance} /></View>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: spacing(1.25) }}>
            <Button title="Уточнить остаток" variant="ghost" onPress={() => setEditingBalance(true)} />
          </View>
        )}
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={labelStyle}>Прогноз на конец месяца</Text>
        <Money value={forecastBalance} />
        <View style={{ marginTop: spacing(1.25), gap: spacing(0.75) }}>
          <Row label="Ожидаемые доходы" value={<Money value={futureIncome} tone="income" size={16} />} />
          <Divider />
          <Row label="Ожидаемые расходы" value={<Money value={futureExpense} tone="expense" size={16} />} />
        </View>
        <Text style={{ color: colors.textMuted, marginTop: spacing(1), fontSize: 12 }}>
          Прогноз считается как ожидаемые доходы месяца минус ожидаемые расходы месяца.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Row label="Доходы месяца" value={<Money value={summary?.totalIncome ?? 0} tone="income" />} />
        <Divider />
        <Row label="Расходы месяца" value={<Money value={summary?.totalExpense ?? 0} tone="expense" />} />
        <Divider />
        <Row label="Баланс месяца" value={<Money value={summary?.balance ?? 0} />} />
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
        <Card style={{ flex: 1 }}>
          <Text style={labelStyle}>Остаток портфеля</Text>
          <Money value={summary?.currentBalance ?? 0} />
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={labelStyle}>Обязательные платежи</Text>
          <Money value={summary?.obligatoryTotal ?? 0} />
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
        <View style={{ flex: 1 }}>
          <Button title="＋ Расход" onPress={() => navigation.navigate('AddExpense')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="📷 Импорт" variant="ghost" onPress={() => navigation.navigate('ScanReceipt')} />
        </View>
      </View>

      {forecast ? (
        <Card style={{ marginTop: spacing(1.5) }}>
          <Text style={labelStyle}>Длинный прогноз</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>
            3 мес: {fmt(forecast.forecast?.in3Months)} · 6 мес: {fmt(forecast.forecast?.in6Months)}
          </Text>
        </Card>
      ) : null}

      {clarifyCount > 0 ? (
        <Pressable onPress={() => navigation.navigate('Clarification')}>
          <Card style={{ marginTop: spacing(1.5), borderColor: colors.warning }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.warning, fontWeight: '700' }}>Требует уточнения: {clarifyCount}</Text>
              <Text style={{ color: colors.warning, fontSize: 18 }}>›</Text>
            </View>
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>Расходы, которые бот или AI не смогли точно определить.</Text>
          </Card>
        </Pressable>
      ) : null}

      <Text style={[labelStyle, { marginTop: spacing(2.5), marginBottom: spacing(1) }]}>Расходы по категориям</Text>
      {summary?.byCategory?.length ? (
        summary.byCategory.slice(0, 8).map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color ?? colors.primary }} />
              <Text style={{ color: colors.text }}>{c.name}</Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{fmt(c.amount)}</Text>
          </View>
        ))
      ) : (
        <Text style={{ color: colors.textMuted }}>Пока нет расходов в этом месяце.</Text>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(1) }}>
      <Text style={{ color: colors.textMuted, flex: 1 }}>{label}</Text>
      {value}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.25) }} />;
}

const labelStyle = { color: colors.textMuted, fontSize: 13, marginBottom: 6 } as const;
const fmt = (n?: number) => new Intl.NumberFormat('ru-RU').format(n ?? 0) + ' ₽';
