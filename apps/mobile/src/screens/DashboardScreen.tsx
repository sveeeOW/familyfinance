import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { AnalyticsSummary } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Money, ScreenTitle } from '../components/ui';
import { PortfolioPicker } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

export default function DashboardScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [audit, setAudit] = useState<any>(null);
  const [mainAccount, setMainAccount] = useState('');
  const [savingsAccount, setSavingsAccount] = useState('');
  const [auditBusy, setAuditBusy] = useState(false);
  const [clarifyCount, setClarifyCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [s, f, c, a] = await Promise.all([
        api.summary(selectedId),
        api.forecast(selectedId),
        api.needsClarification(selectedId),
        api.balanceAudit(selectedId),
      ]);
      setSummary(s);
      setForecast(f);
      setClarifyCount(c.length);
      setAudit(a);
    } catch {
      // экран покажет последнее доступное состояние
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { loadPortfolios().then(loadData); }, [loadData, loadPortfolios]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const actualBalance = summary?.availableNow ?? forecast?.actualToDate?.balance ?? summary?.balance ?? 0;
  const futureIncome = summary?.totalIncome ?? forecast?.restOfMonth?.income ?? forecast?.expectedIncome ?? 0;
  const futureExpense = summary?.totalExpense ?? summary?.plannedExpense ?? forecast?.restOfMonth?.expense ?? forecast?.obligatory ?? 0;
  const monthBalance = futureIncome - futureExpense;
  const forecastBalance = actualBalance + monthBalance;
  const enteredActual = useMemo(() => parseMoney(mainAccount) + parseMoney(savingsAccount), [mainAccount, savingsAccount]);

  const runAudit = async () => {
    if (!selectedId) return;
    setAuditBusy(true);
    try {
      setAudit(await api.balanceAudit(selectedId, enteredActual));
    } finally {
      setAuditBusy(false);
    }
  };

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
          Начальный остаток + подтверждённые доходы − подтверждённые расходы. Планы и будущие платежи сюда не входят.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Проверка баланса</Text>
        <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>
          Введите остатки на счетах. Накопительный или инвестиционный счёт можно учитывать второй суммой.
        </Text>
        <View style={{ gap: spacing(1), marginTop: spacing(1.25) }}>
          <BalanceInput label="Основные счета" value={mainAccount} onChangeText={setMainAccount} placeholder="162 898,93" />
          <BalanceInput label="Накопительный счёт" value={savingsAccount} onChangeText={setSavingsAccount} placeholder="102 491,54" />
        </View>
        <View style={{ marginTop: spacing(1.25) }}>
          <Button title={enteredActual > 0 ? `Сверить ${fmt(enteredActual)}` : 'Сверить с банком'} onPress={runAudit} loading={auditBusy} />
        </View>

        {audit?.formula ? (
          <View style={{ marginTop: spacing(1.5), gap: spacing(0.75) }}>
            <Row label="Начальный остаток" value={<Money value={audit.formula.openingBalance ?? 0} size={16} />} />
            <Divider />
            <Row label="Подтверждённые доходы" value={<Money value={audit.formula.confirmedIncome ?? 0} tone="income" size={16} />} />
            <Divider />
            <Row label="Подтверждённые расходы" value={<Money value={audit.formula.confirmedExpense ?? 0} tone="expense" size={16} />} />
            <Divider />
            <Row label="Расчётный баланс" value={<Money value={audit.formula.calculatedBalance ?? 0} size={16} />} />
            {audit.formula.actualBalance != null ? <>
              <Divider />
              <Row label="Фактически на счетах" value={<Money value={audit.formula.actualBalance} size={16} />} />
              <Divider />
              <Row label="Расхождение" value={<Money value={audit.formula.difference ?? 0} tone={Math.abs(audit.formula.difference ?? 0) < 1 ? 'income' : 'expense'} size={16} />} />
            </> : null}
          </View>
        ) : null}

        {audit?.warnings?.length ? (
          <View style={{ marginTop: spacing(1.25), gap: spacing(0.75) }}>
            {audit.warnings.map((warning: any, index: number) => (
              <View key={`${warning.code}-${index}`} style={{ padding: spacing(1), borderRadius: radius.md, backgroundColor: colors.yellowSoft }}>
                <Text style={{ color: colors.text, fontSize: 12 }}>⚠️ {warning.message}{warning.amount != null ? ` Разница: ${fmt(warning.amount)}` : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {audit?.counts ? (
          <Text style={{ color: colors.textMuted, marginTop: spacing(1.25), fontSize: 12 }}>
            Учтено: доходов {audit.counts.incomeEntries}, расходов {audit.counts.expenseEntries}. Возможных дублей: {Number(audit.counts.possibleExpenseDuplicates ?? 0) + Number(audit.counts.possibleIncomeDuplicates ?? 0)}.
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={labelStyle}>Прогноз на конец месяца</Text>
        <Money value={forecastBalance} />
        <View style={{ marginTop: spacing(1.25), gap: spacing(0.75) }}>
          <Row label="Доступно сейчас" value={<Money value={actualBalance} size={16} />} />
          <Divider />
          <Row label="Баланс месяца" value={<Money value={monthBalance} size={16} />} />
          <Divider />
          <Row label="Ожидаемые доходы" value={<Money value={futureIncome} tone="income" size={16} />} />
          <Divider />
          <Row label="Ожидаемые расходы" value={<Money value={futureExpense} tone="expense" size={16} />} />
        </View>
        <Text style={{ color: colors.textMuted, marginTop: spacing(1), fontSize: 12 }}>
          Прогноз считается отдельно от текущего баланса и включает будущие доходы и обязательства.
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
          <Text style={labelStyle}>Расчётный баланс</Text>
          <Money value={summary?.availableNow ?? 0} />
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

function BalanceInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing(1.25), color: colors.text, backgroundColor: colors.bg }}
      />
    </View>
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

function parseMoney(value: string) {
  const normalized = String(value ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const labelStyle = { color: colors.textMuted, fontSize: 13, marginBottom: 6 } as const;
const fmt = (n?: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n ?? 0) + ' ₽';
