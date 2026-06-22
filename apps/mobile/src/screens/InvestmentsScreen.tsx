import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Investment, InvestmentForecast } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const ASSET_TYPES = [
  { key: 'STOCK', label: 'Акция' },
  { key: 'BOND', label: 'Облигация' },
  { key: 'FUND', label: 'Фонд' },
  { key: 'DEPOSIT', label: 'Вклад' },
  { key: 'CRYPTO', label: 'Крипта' },
  { key: 'OTHER', label: 'Другое' },
];

export default function InvestmentsScreen() {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Investment[]>([]);
  const [forecast, setForecast] = useState<InvestmentForecast | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'STOCK', qty: '', avg: '', cur: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [list, f] = await Promise.all([
        api.investments(selectedId),
        api.investmentForecast(selectedId),
      ]);
      setItems(list);
      setForecast(f);
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!selectedId) return;
    const quantity = Number(form.qty.replace(',', '.'));
    const averageBuyPrice = Number(form.avg.replace(',', '.'));
    if (!form.name || !quantity || !averageBuyPrice) {
      Alert.alert('Заполните поля', 'Актив, количество и цена покупки обязательны.');
      return;
    }
    setBusy(true);
    try {
      await api.createInvestment({
        portfolioId: selectedId,
        assetName: form.name,
        assetType: form.type,
        quantity,
        averageBuyPrice,
        currentPrice: form.cur ? Number(form.cur.replace(',', '.')) : undefined,
      });
      setForm({ name: '', type: 'STOCK', qty: '', avg: '', cur: '' });
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
      <ScreenTitle>Инвестиции</ScreenTitle>

      {forecast ? (
        <Card style={{ marginBottom: spacing(2) }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Стоимость портфеля</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{fmt(forecast.portfolioValue)}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 12 }}>
            Дивиденды: за месяц {fmt(forecast.expectedDividendsThisMonth)} · за год {fmt(forecast.expectedDividendsThisYear)}
          </Text>
        </Card>
      ) : null}

      {items.map((i) => (
        <Card key={i.id} style={{ marginBottom: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{i.assetName}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{fmt(i.marketValue ?? 0)}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {i.quantity} шт · ср. цена {i.averageBuyPrice}
            {typeof i.profit === 'number' ? (
              <Text style={{ color: i.profit >= 0 ? colors.income : colors.expense }}>
                {'  '}{i.profit >= 0 ? '+' : ''}{fmt(i.profit)}
              </Text>
            ) : null}
          </Text>
        </Card>
      ))}

      {showForm ? (
        <Card style={{ marginTop: spacing(1) }}>
          <Field label="Актив" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Сбербанк ао" />
          <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: 13 }}>Тип актива</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(1.5) }}>
            {ASSET_TYPES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setForm({ ...form, type: t.key })}
                style={{
                  paddingHorizontal: spacing(1.5),
                  paddingVertical: spacing(0.75),
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: form.type === t.key ? colors.primary : colors.border,
                  backgroundColor: form.type === t.key ? colors.cardAlt : 'transparent',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Количество" keyboardType="numeric" value={form.qty} onChangeText={(v) => setForm({ ...form, qty: v })} />
          <Field label="Средняя цена покупки" keyboardType="numeric" value={form.avg} onChangeText={(v) => setForm({ ...form, avg: v })} />
          <Field label="Текущая цена (опц.)" keyboardType="numeric" value={form.cur} onChangeText={(v) => setForm({ ...form, cur: v })} />
          <Button title="Сохранить актив" onPress={submit} loading={busy} />
        </Card>
      ) : (
        <Button title="Добавить актив" variant="ghost" onPress={() => setShowForm(true)} />
      )}
    </ScrollView>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
