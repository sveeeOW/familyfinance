import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { request } from '../api/client';
import { Button, Card, Field, IconBubble, ScreenTitle, appFont } from '../components/ui';
import { usePortfolios } from '../store/portfolio';
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

type ImportDraft = {
  logId: string;
  operationType: 'expense' | 'income' | 'transfer' | 'unknown';
  suggestedAction: 'expense' | 'income' | 'skip';
  parsed: {
    amount: number | null;
    date: string | null;
    merchant: string | null;
    description: string | null;
    category: string | null;
    confidence: number;
  };
};

const STORAGE_KEY = 'familyfinance.creditCards.v1';
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽';
const MAX_BASE64_SIZE = 950000;

function daysBetween(from: string, to = new Date()) {
  const start = new Date(from);
  const diff = to.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function daysLeft(charge: ChargeItem) {
  return Math.max(0, charge.graceDays - daysBetween(charge.spentAt));
}

export default function CreditCardsScreen() {
  const { selectedId: portfolioId, load: loadPortfolios } = usePortfolios();
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
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanDrafts, setScanDrafts] = useState<ImportDraft[]>([]);
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [chargeFormOpen, setChargeFormOpen] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);

  useEffect(() => { loadPortfolios().catch(() => {}); }, [loadPortfolios]);
  useFocusEffect(useCallback(() => { loadCards().catch(() => {}); }, [portfolioId]));

  const loadCards = async () => {
    if (!portfolioId) return;
    setLoading(true);
    try {
      let data = await request<CardItem[]>(`/credit-cards?portfolioId=${portfolioId}`);
      if (!data.length) data = await migrateLocalCards(portfolioId);
      setCards(data);
      setSelectedId((current) => data.some((card) => card.id === current) ? current : data[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  };

  const migrateLocalCards = async (targetPortfolioId: string): Promise<CardItem[]> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const local = JSON.parse(raw) as CardItem[];
      if (!Array.isArray(local) || !local.length) return [];
      for (const card of local) {
        const created = await request<CardItem>('/credit-cards', {
          method: 'POST',
          body: { portfolioId: targetPortfolioId, title: card.title, limitAmount: Number(card.limitAmount) || 0, graceDays: Number(card.graceDays) || 120 },
        });
        for (const charge of card.charges ?? []) {
          await request(`/credit-cards/${created.id}/charges`, {
            method: 'POST',
            body: { title: charge.title, amount: Number(charge.amount), spentAt: charge.spentAt, graceDays: charge.graceDays },
          });
        }
        for (const payment of card.payments ?? []) {
          await request(`/credit-cards/${created.id}/payments`, {
            method: 'POST',
            body: { amount: Number(payment.amount), paidAt: payment.paidAt },
          });
        }
      }
      await AsyncStorage.setItem(`${STORAGE_KEY}.migrated`, 'true');
      return request<CardItem[]>(`/credit-cards?portfolioId=${targetPortfolioId}`);
    } catch {
      return [];
    }
  };

  const selected = useMemo(() => cards.find((card) => card.id === selectedId) ?? cards[0] ?? null, [cards, selectedId]);
  const openCharges = selected?.charges.filter((charge) => charge.remainingAmount > 0) ?? [];
  const totalDebt = openCharges.reduce((sum, charge) => sum + charge.remainingAmount, 0);
  const availableLimit = selected ? selected.limitAmount - totalDebt : 0;

  const createCard = async () => {
    if (!portfolioId) return;
    const limit = Number(limitAmount.replace(',', '.')) || 0;
    const grace = Number(graceDays) || 120;
    const title = cardName.trim() || 'Кредитная карта';
    const card = await request<CardItem>('/credit-cards', { method: 'POST', body: { portfolioId, title, limitAmount: limit, graceDays: grace } });
    await loadCards();
    setSelectedId(card.id);
    setCardName('');
    setLimitAmount('');
    setGraceDays('120');
  };

  const resetChargeForm = () => {
    setEditingChargeId(null);
    setChargeTitle('');
    setChargeAmount('');
    setChargeDate(today());
  };

  const addOrUpdateCharge = async () => {
    if (!selected) return;
    const amount = Number(chargeAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    if (!editingChargeId) {
      await request(`/credit-cards/${selected.id}/charges`, { method: 'POST', body: { title: chargeTitle.trim() || 'Покупка по карте', amount, spentAt: chargeDate || today() } });
    } else {
      await request(`/credit-cards/charges/${editingChargeId}`, { method: 'PATCH', body: { title: chargeTitle.trim() || 'Покупка по карте', amount, spentAt: chargeDate || today() } });
    }
    await loadCards();
    resetChargeForm();
  };

  const editCharge = (charge: ChargeItem) => {
    setEditingChargeId(charge.id);
    setChargeTitle(charge.title);
    setChargeAmount(String(charge.amount));
    setChargeDate(charge.spentAt);
    setChargeFormOpen(true);
  };

  const deleteCharge = async (chargeId: string) => {
    await request(`/credit-cards/charges/${chargeId}`, { method: 'DELETE' });
    await loadCards();
    if (editingChargeId === chargeId) resetChargeForm();
  };

  const addPayment = async () => {
    if (!selected) return;
    const amount = Number(paymentAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    await request(`/credit-cards/${selected.id}/payments`, { method: 'POST', body: { amount, paidAt: paymentDate || today() } });
    await loadCards();
    setPaymentAmount('');
    setPaymentDate(today());
  };

  const deleteCard = async (id: string) => {
    await request(`/credit-cards/${id}`, { method: 'DELETE' });
    await loadCards();
  };

  const importFile = async () => {
    setScanError(null);
    if (!selected || !portfolioId) {
      setScanError('Сначала создайте и выберите кредитную карту.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['image/*', 'application/pdf'] });
    if (result.canceled) return;
    const asset = result.assets?.[0] as any;
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? asset.mime ?? 'image/jpeg', asset.name ?? 'document');
  };

  const takePhoto = async () => {
    setScanError(null);
    if (!selected || !portfolioId) {
      setScanError('Сначала создайте и выберите кредитную карту.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setScanError('Нет доступа к камере. Разрешите доступ в настройках.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: false, quality: 0.5 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? 'image/jpeg', 'credit-card-photo.jpg', asset.width);
  };

  const processPickedFile = async (uri: string, mimeType: string, filename: string, width?: number | null) => {
    if (!portfolioId) return;
    setScanLoading(true);
    setScanDrafts([]);
    setSelectedDrafts({});
    setScanStatus('Готовлю файл к анализу…');
    setScanError(null);
    try {
      let fileBase64: string;
      let finalMime = mimeType || 'image/jpeg';
      if (finalMime.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        setScanStatus('Читаю PDF-документ…');
        fileBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        finalMime = 'application/pdf';
        if (fileBase64.length > 3500000) throw new Error('PDF слишком большой. Отправьте одну страницу или скрин нужного фрагмента.');
      } else {
        setScanStatus('Сжимаю изображение для AI-анализа…');
        fileBase64 = await prepareImageForImport(uri, width);
        finalMime = 'image/jpeg';
      }
      setScanStatus('ИИ ищет покупки по кредитке…');
      const imported = await request<ImportDraft[]>('/ai/import-operations', { method: 'POST', body: { portfolioId, fileBase64, mimeType: finalMime, filename } });
      const expenseDrafts = (imported ?? []).filter((item) => item.parsed.amount && item.suggestedAction !== 'income');
      setScanDrafts(expenseDrafts);
      const initial: Record<string, boolean> = {};
      for (const item of expenseDrafts) initial[item.logId] = true;
      setSelectedDrafts(initial);
      if (!expenseDrafts.length) setScanError('ИИ не нашёл покупок на изображении. Попробуйте обрезать скрин до области с суммами.');
    } catch (e: any) {
      setScanError(e.message ?? 'Не удалось распознать файл.');
    } finally {
      setScanLoading(false);
      setScanStatus(null);
    }
  };

  const addScannedCharges = async () => {
    if (!selected) return;
    const selectedItems = scanDrafts.filter((draft) => selectedDrafts[draft.logId]);
    if (!selectedItems.length) {
      setScanError('Выберите хотя бы одну покупку для добавления в кредитку.');
      return;
    }
    setScanLoading(true);
    try {
      for (const draft of selectedItems) {
        await request(`/credit-cards/${selected.id}/charges`, {
          method: 'POST',
          body: {
            title: draft.parsed.merchant ?? draft.parsed.description ?? 'Покупка по кредитке',
            amount: Number(draft.parsed.amount),
            spentAt: draft.parsed.date ?? today(),
            aiLogId: draft.logId,
          },
        });
      }
      setScanDrafts([]);
      setSelectedDrafts({});
      await loadCards();
    } catch (e: any) {
      setScanError(e.message ?? 'Не удалось добавить покупки в кредитку.');
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(18) }}>
      <ScreenTitle subtitle="Каждая покупка имеет свой беспроцентный таймер">Кредитные карты</ScreenTitle>

      <CollapsibleCard
        title="Добавить карту"
        subtitle="Название, лимит и беспроцентный период"
        open={cardFormOpen}
        onToggle={() => setCardFormOpen((v) => !v)}
      >
        <Field label="Название карты" value={cardName} onChangeText={setCardName} placeholder="Например: T-Банк Platinum" />
        <Field label="Лимит, ₽" value={limitAmount} onChangeText={setLimitAmount} keyboardType="decimal-pad" placeholder="340000" />
        <Field label="Беспроцентный период, дней" value={graceDays} onChangeText={setGraceDays} keyboardType="numeric" placeholder="120" />
        <Button title="Создать карту" onPress={createCard} disabled={!portfolioId || loading} />
      </CollapsibleCard>

      {loading ? <Card style={{ marginTop: spacing(1.5), alignItems: 'center' }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textMuted, marginTop: spacing(1) }}>Загружаю кредитки…</Text></Card> : null}

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
          <View style={{ marginTop: spacing(1.5) }}><Text style={{ color: colors.expense, fontFamily: appFont, fontSize: 26, fontWeight: '800' }}>Долг: {money(totalDebt)}</Text></View>
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) }}>
            <View style={{ flex: 1 }}><Button title="Скан покупки" icon="camera" variant="yellow" onPress={takePhoto} disabled={scanLoading} /></View>
            <View style={{ flex: 1 }}><Button title="Файл" icon="receipt" variant="ghost" onPress={importFile} disabled={scanLoading} /></View>
          </View>
          <View style={{ marginTop: spacing(1) }}><Button title="Удалить карту" variant="danger" onPress={() => deleteCard(selected.id)} /></View>
        </Card>

        {scanLoading ? <Card style={{ alignItems: 'center', marginBottom: spacing(1.5) }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.text, marginTop: spacing(1), fontWeight: '600', textAlign: 'center' }}>{scanStatus ?? 'Распознаю покупку…'}</Text></Card> : null}
        {scanError ? <Card style={{ borderColor: colors.warning, marginBottom: spacing(1.5) }}><Text style={{ color: colors.warning, fontWeight: '700' }}>Нужна проверка</Text><Text style={{ color: colors.textMuted, marginTop: 6 }}>{scanError}</Text></Card> : null}
        {scanDrafts.length ? <Card style={{ marginBottom: spacing(1.5) }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700', marginBottom: spacing(1) }}>Найденные покупки</Text>
          {scanDrafts.map((draft, index) => {
            const checked = selectedDrafts[draft.logId] ?? false;
            return <Pressable key={draft.logId} onPress={() => setSelectedDrafts((current) => ({ ...current, [draft.logId]: !checked }))} style={{ paddingVertical: spacing(1), borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) }}>
                <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>{checked ? '✅ ' : '⬜️ '}{draft.parsed.merchant ?? draft.parsed.description ?? 'Покупка'}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{draft.parsed.date ?? today()} · уверенность {draft.parsed.confidence}%</Text></View>
                <Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '800' }}>{money(Number(draft.parsed.amount ?? 0))}</Text>
              </View>
            </Pressable>;
          })}
          <Button title="Добавить выбранные в кредитку" onPress={addScannedCharges} loading={scanLoading} />
        </Card> : null}

        <CollapsibleCard
          title={editingChargeId ? 'Редактировать покупку' : 'Новая покупка'}
          subtitle="Ручное добавление покупки по выбранной кредитке"
          open={chargeFormOpen}
          onToggle={() => setChargeFormOpen((v) => !v)}
        >
          <Field label="Описание" value={chargeTitle} onChangeText={setChargeTitle} placeholder="Покупка" />
          <Field label="Сумма, ₽" value={chargeAmount} onChangeText={setChargeAmount} keyboardType="decimal-pad" placeholder="50000" />
          <Field label="Дата покупки" value={chargeDate} onChangeText={setChargeDate} placeholder="2026-06-02" />
          <View style={{ gap: spacing(1) }}>
            <Button title={editingChargeId ? 'Сохранить покупку' : 'Добавить покупку'} onPress={addOrUpdateCharge} />
            {editingChargeId ? <Button title="Отменить редактирование" variant="ghost" onPress={resetChargeForm} /> : null}
          </View>
        </CollapsibleCard>

        <CollapsibleCard
          title="Внести платёж"
          subtitle="Погашение идёт в счёт самых ранних незакрытых покупок"
          open={paymentFormOpen}
          onToggle={() => setPaymentFormOpen((v) => !v)}
        >
          <Field label="Сумма, ₽" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="40000" />
          <Field label="Дата платежа" value={paymentDate} onChangeText={setPaymentDate} placeholder="2026-06-25" />
          <Button title="Погасить по старым покупкам" onPress={addPayment} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing(1) }}>Платёж автоматически идёт в счёт самых ранних незакрытых покупок.</Text>
        </CollapsibleCard>

        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontWeight: '700', marginBottom: spacing(1) }}>Открытые покупки</Text>
        {openCharges.length ? openCharges.map((charge) => <Card key={charge.id} style={{ marginBottom: spacing(1) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontFamily: appFont, fontWeight: '700' }}>{charge.title}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{new Date(charge.spentAt).toLocaleDateString('ru-RU')} · осталось {daysLeft(charge)} дней</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '800' }}>{money(charge.remainingAmount)}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>из {money(charge.amount)}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.25) }}>
            <Pressable onPress={() => editCharge(charge)} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.primarySoft }}><Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '600' }}>Изменить</Text></Pressable>
            <Pressable onPress={() => deleteCharge(charge.id)} style={{ flex: 1, paddingVertical: spacing(1), borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.redSoft }}><Text style={{ color: colors.expense, fontFamily: appFont, fontWeight: '600' }}>Удалить</Text></Pressable>
          </View>
        </Card>) : <Text style={{ color: colors.textMuted }}>Открытых задолженностей нет.</Text>}
      </> : <Card style={{ marginTop: spacing(1.5) }}><Text style={{ color: colors.textMuted }}>Создайте кредитную карту, чтобы учитывать покупки и платежи.</Text></Card>}
    </ScrollView>
  );
}

function CollapsibleCard({ title, subtitle, open, onToggle, children }: { title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: spacing(1.5) }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(1) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12 }}>{subtitle}</Text> : null}
        </View>
        <Text style={{ color: colors.primary, fontFamily: appFont, fontSize: 22, fontWeight: '800' }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={{ marginTop: spacing(1.5) }}>{children}</View> : null}
    </Card>
  );
}

async function prepareImageForImport(uri: string, width?: number | null): Promise<string> {
  const variants = [
    { width: width && width < 760 ? width : 760, quality: 0.42 },
    { width: 640, quality: 0.34 },
    { width: 520, quality: 0.28 },
    { width: 420, quality: 0.24 },
  ];
  let lastBase64: string | undefined;
  for (const variant of variants) {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: variant.width } }], { compress: variant.quality, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    lastBase64 = result.base64;
    if (result.base64 && result.base64.length <= MAX_BASE64_SIZE) return result.base64;
  }
  if (!lastBase64) throw new Error('Не удалось подготовить изображение для импорта.');
  if (lastBase64.length > MAX_BASE64_SIZE) throw new Error('Скрин слишком большой даже после сжатия. Обрежьте лишние поля вокруг операции и попробуйте снова.');
  return lastBase64;
}
