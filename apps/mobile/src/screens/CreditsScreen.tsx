import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Credit } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, ScreenTitle } from '../components/ui';
import { colors, spacing } from '../theme';

export default function CreditsScreen() {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Credit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', bankName: '', initial: '', remaining: '', monthly: '', day: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.credits(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!selectedId) return;
    const initial = Number(form.initial.replace(/\s/g, ''));
    const remaining = Number(form.remaining.replace(/\s/g, ''));
    const monthly = Number(form.monthly.replace(/\s/g, ''));
    const day = Number(form.day);
    if (!form.title || !remaining || !monthly || !day) {
      Alert.alert('Заполните поля', 'Название, остаток, платёж и день платежа обязательны.');
      return;
    }
    setBusy(true);
    try {
      await api.createCredit({
        portfolioId: selectedId,
        title: form.title,
        bankName: form.bankName || undefined,
        initialAmount: initial || remaining,
        remainingAmount: remaining,
        monthlyPayment: monthly,
        paymentDay: day,
      });
      setForm({ title: '', bankName: '', initial: '', remaining: '', monthly: '', day: '' });
      setShowForm(false);
      load();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Кредиты</ScreenTitle>

      {items.length === 0 && !showForm ? (
        <Text style={{ color: colors.textMuted, marginBottom: spacing(2) }}>Кредитов пока нет.</Text>
      ) : null}

      {items.map((c) => (
        <Card key={c.id} style={{ marginBottom: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{c.title}</Text>
            <Text style={{ color: colors.expense, fontWeight: '700' }}>
              {fmt(Number(c.monthlyPayment))}/мес
            </Text>
          </View>
          {c.bankName ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.bankName}</Text> : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing(1.25) }} />
          <Line label="Остаток долга" value={fmt(Number(c.remainingAmount))} />
          {c.schedule ? (
            <>
              <Line label="Ближайший платёж" value={`${fmt(c.schedule.nextPaymentAmount)} · ${new Date(c.schedule.nextPaymentDate).toLocaleDateString('ru-RU')}`} />
              <Line label="Осталось месяцев" value={String(c.schedule.monthsLeft)} />
              <Line label="Всего к выплате" value={fmt(c.schedule.totalFuturePayments)} />
            </>
          ) : null}
        </Card>
      ))}

      {showForm ? (
        <Card style={{ marginTop: spacing(1) }}>
          <Field label="Название" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Ипотека" />
          <Field label="Банк" value={form.bankName} onChangeText={(v) => setForm({ ...form, bankName: v })} placeholder="Сбербанк" />
          <Field label="Сумма кредита" keyboardType="numeric" value={form.initial} onChangeText={(v) => setForm({ ...form, initial: v })} />
          <Field label="Остаток долга" keyboardType="numeric" value={form.remaining} onChangeText={(v) => setForm({ ...form, remaining: v })} />
          <Field label="Ежемесячный платёж" keyboardType="numeric" value={form.monthly} onChangeText={(v) => setForm({ ...form, monthly: v })} />
          <Field label="День платежа (1–31)" keyboardType="numeric" value={form.day} onChangeText={(v) => setForm({ ...form, day: v })} />
          <Button title="Сохранить кредит" onPress={submit} loading={busy} />
        </Card>
      ) : (
        <Button title="Добавить кредит" variant="ghost" onPress={() => setShowForm(true)} />
      )}
    </ScrollView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
