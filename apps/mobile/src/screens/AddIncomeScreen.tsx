import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { usePortfolios } from '../store/portfolio';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const INCOME_TYPES = [
  { key: 'SALARY', label: 'Зарплата' },
  { key: 'ADVANCE', label: 'Аванс' },
  { key: 'BONUS', label: 'Премия' },
  { key: 'DIVIDENDS', label: 'Дивиденды' },
  { key: 'INVESTMENT', label: 'Инвестиции' },
  { key: 'DEPOSIT_INTEREST', label: 'Проценты' },
  { key: 'DEBT_RETURN', label: 'Возврат долга' },
  { key: 'GIFT', label: 'Подарок' },
  { key: 'SIDE_JOB', label: 'Подработка' },
  { key: 'OTHER', label: 'Другое' },
];

const RECURRENCES = [
  { key: 'MONTHLY', label: 'Ежемесячно' },
  { key: 'TWICE_A_MONTH', label: '2 раза в месяц' },
  { key: 'WEEKLY', label: 'Еженедельно' },
  { key: 'ONE_TIME', label: 'Разово' },
];

export default function AddIncomeScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('SALARY');
  const [recurrence, setRecurrence] = useState('MONTHLY');
  const [paymentDay, setPaymentDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!value || value <= 0) {
      setError('Введите сумму');
      return;
    }
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.createIncome({
        portfolioId: selectedId,
        type,
        amount: value,
        date: new Date().toISOString().slice(0, 10),
        recurrence,
        paymentDay: paymentDay ? Number(paymentDay) : undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Новый доход</ScreenTitle>
      <Field label="Сумма, ₽" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="225000" />

      <Text style={label}>Тип дохода</Text>
      <Chips options={INCOME_TYPES} value={type} onChange={setType} />

      <Text style={[label, { marginTop: spacing(2) }]}>Периодичность</Text>
      <Chips options={RECURRENCES} value={recurrence} onChange={setRecurrence} />

      {recurrence !== 'ONE_TIME' ? (
        <View style={{ marginTop: spacing(2) }}>
          <Field
            label="День получения (1–31, опц.)"
            keyboardType="numeric"
            value={paymentDay}
            onChangeText={setPaymentDay}
            placeholder="5"
          />
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.expense, marginVertical: spacing(1) }}>{error}</Text> : null}
      <View style={{ marginTop: spacing(2) }}>
        <Button title="Сохранить доход" onPress={submit} loading={busy} />
      </View>
    </ScrollView>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={{
            paddingHorizontal: spacing(1.5),
            paddingVertical: spacing(0.75),
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: value === o.key ? colors.primary : colors.border,
            backgroundColor: value === o.key ? colors.cardAlt : 'transparent',
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const label = { color: colors.textMuted, marginBottom: 6, fontSize: 13 } as const;
