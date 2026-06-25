import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, IconBubble, ScreenTitle, appFont } from '../components/ui';
import { colors, radius, spacing } from '../theme';

type CardItem = {
  id: string;
  title: string;
  limitAmount: number;
  graceDays: number;
  charges: ChargeItem[];
  payments: PaymentItem[];
};

type ChargeItem = {
  id: string;
  title: string;
  amount: number;
  remainingAmount: number;
  spentAt: string;
  graceDays: number;
  closedAt?: string | null;
};

type PaymentItem = { id: string; amount: number; paidAt: string; chargeId?: string | null };

const STORAGE_KEY = 'familyfinance.creditCards.v1';
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽';

function daysBetween(from: string, to = new Date()) {
  const start = new Date(from);
  const diff = to.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function daysLeft(charge: ChargeItem) {
  return Math.max(0, charge.graceDays - daysBetween(charge.spentAt));
}

export default function CreditCardsScreen() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardName, setCardName] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [graceDays, setGraceDays] = useState('120');
  const [chargeTitle, setChargeTitle] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDate, setChargeDate] = useState(today());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as CardItem[];
      setCards(parsed);
      setSelectedId(parsed[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const persist = async (next: CardItem[]) => {
    setCards(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const selected = useMemo(() => cards.find((card) => card.id === selectedId) ?? cards[0] ?? null, [cards, selectedId]);
  const openCharges = selected?.charges.filter((charge) => charge.remainingAmount > 0) ?? [];
  const totalDebt = openCharges.reduce((sum, charge) => sum + charge.remainingAmount, 0);
  const availableLimit = selected ? selected.limitAmount - totalDebt : 0;

  const createCard = async () => {
    const limit = Number(limitAmount.replace(',', '.')) || 0;
    const grace = Number(graceDays) || 120;
    const title = cardName.trim() || 'Кредитная карта';
    const card: CardItem = { id: uid(), title, limitAmount: limit, graceDays: grace, charges: [], payments: [] };
    const next = [card, ...cards];
    await persist(next);
    setSelectedId(card.id);
    setCardName('');
    setLimitAmount('');
    setGraceDays('120');
  };

  const addCharge = async () => {
    if (!selected) return;
    const amount = Number(chargeAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    const charge: ChargeItem = { id: uid(), title: chargeTitle.trim() || 'Покупка по карте', amount, remainingAmount: amount, spentAt: chargeDate || today(), graceDays: selected.graceDays };
    const next = cards.map((card) => card.id === selected.id ? { ...card, charges: [charge, ...card.charges] } : card);
    await persist(next);
    setChargeTitle('');
    setChargeAmount('');
    setChargeDate(today());
  };

  const addPayment = async () => {
    if (!selected) return;
    let rest = Number(paymentAmount.replace(',', '.'));
    if (!rest || rest <= 0) return;
    const updatedCharges = [...selected.charges].sort((a, b) => new Date(a.spentAt).getTime() - new Date(b.spentAt).getTime()).map((charge) => ({ ...charge }));
    const payments: PaymentItem[] = [];
    for (const charge of updatedCharges) {
      if (rest <= 0) break;
      if (charge.remainingAmount <= 0) continue;
      const applied = Math.min(rest, charge.remainingAmount);
      charge.remainingAmount = Math.max(0, charge.remainingAmount - applied);
      if (charge.remainingAmount === 0) charge.closedAt = paymentDate || today();
      payments.push({ id: uid(), amount: applied, paidAt: paymentDate || today(), chargeId: charge.id });
      rest -= applied;
    }
    const next = cards.map((card) => card.id === selected.id ? { ...card, charges: updatedCharges, payments: [...payments, ...card.payments] } : card);
    await persist(next);
    setPaymentAmount('');
    setPaymentDate(today());
  };

  const deleteCard = async (id: string) => {
    const next = cards.filter((card) => card.id !== id);
    await persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(12) }}>
      <ScreenTitle subtitle="Каждая покупка имеет свой беспроцентный таймер">Кредитные карты</ScreenTitle>

      <Card>
        <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700', marginBottom: spacing(1) }}>Добавить карту</Text>
        <Field label="Название карты" value={cardName} onChangeText={setCardName} placeholder="Например: T-Банк Platinum" />
        <Field label="Лимит, ₽" value={limitAmount} onChangeText={setLimitAmount} keyboardType="decimal-pad" placeholder="340000" />
        <Field label="Беспроцентный период, дней" value={graceDays} onChangeText={setGraceDays} keyboardType="numeric" placeholder="120" />
        <Button title="Создать карту" onPress={createCard} />
      </Card>

      {cards.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1.5) }}>{cards.map((card) => <Pressable key={card.id} onPress={() => setSelectedId(card.id)} style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(1), borderRadius: radius.lg, backgroundColor: selected?.id === card.id ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: selected?.id === card.id ? colors.primary : colors.border }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>{card.title}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{card.graceDays} дней</Text></Pressable>)}</ScrollView> : null}

      {selected ? <>
        <Card style={{ marginBottom: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <IconBubble name="card" color={colors.primary} bg={colors.primarySoft} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700' }}>{selected.title}</Text>
              <Text style={{ color: colors.textMuted, marginTop: 4 }}>Лимит: {money(selected.limitAmount)} · доступно: {money(availableLimit)}</Text>
            </View>
          </View>
          <View style={{ marginTop: spacing(1.5) }}>
            <Text style={{ color: colors.expense, fontFamily: appFont, fontSize: 26, fontWeight: '800' }}>Долг: {money(totalDebt)}</Text>
          </View>
          <View style={{ marginTop: spacing(1) }}><Button title="Удалить карту" variant="danger" onPress={() => deleteCard(selected.id)} /></View>
        </Card>

        <Card style={{ marginBottom: spacing(1.5) }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700', marginBottom: spacing(1) }}>Новая покупка</Text>
          <Field label="Описание" value={chargeTitle} onChangeText={setChargeTitle} placeholder="Покупка" />
          <Field label="Сумма, ₽" value={chargeAmount} onChangeText={setChargeAmount} keyboardType="decimal-pad" placeholder="50000" />
          <Field label="Дата покупки" value={chargeDate} onChangeText={setChargeDate} placeholder="2026-06-02" />
          <Button title="Добавить покупку" onPress={addCharge} />
        </Card>

        <Card style={{ marginBottom: spacing(1.5) }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700', marginBottom: spacing(1) }}>Внести платёж</Text>
          <Field label="Сумма, ₽" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="40000" />
          <Field label="Дата платежа" value={paymentDate} onChangeText={setPaymentDate} placeholder="2026-06-25" />
          <Button title="Погасить по старым покупкам" onPress={addPayment} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing(1) }}>Платёж автоматически идёт в счёт самых ранних незакрытых покупок. Таймер покупки не обнуляется, пока долг по ней не закрыт полностью.</Text>
        </Card>

        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontWeight: '700', marginBottom: spacing(1) }}>Открытые покупки</Text>
        {openCharges.length ? openCharges.map((charge) => <Card key={charge.id} style={{ marginBottom: spacing(1) }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>{charge.title}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{new Date(charge.spentAt).toLocaleDateString('ru-RU')} · осталось {daysLeft(charge)} дней</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '800' }}>{money(charge.remainingAmount)}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>из {money(charge.amount)}</Text></View></View></Card>) : <Text style={{ color: colors.textMuted }}>Открытых задолженностей нет.</Text>}
      </> : null}
    </ScrollView>
  );
}
