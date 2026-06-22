import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { Category } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export default function AddExpenseScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scope, setScope] = useState<'PERSONAL' | 'SHARED'>('SHARED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId) api.categories(selectedId).then(setCategories).catch(() => {});
  }, [selectedId]);

  const submit = useCallback(async () => {
    setError(null);
    const value = Number(amount.replace(',', '.'));
    if (!value || value <= 0) {
      setError('Введите сумму');
      return;
    }
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.createExpense({
        portfolioId: selectedId,
        amount: value,
        title: title || undefined,
        merchant: title || undefined,
        categoryId: categoryId ?? undefined,
        scope,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e.message ?? 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [amount, title, categoryId, scope, selectedId, navigation]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Новый расход</ScreenTitle>
      <Field
        label="Сумма, ₽"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
      />
      <Field label="Описание / продавец" value={title} onChangeText={setTitle} placeholder="Перекрёсток" />

      <Text style={{ color: colors.textMuted, marginBottom: 6 }}>Тип расхода</Text>
      <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(2) }}>
        {(['SHARED', 'PERSONAL'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setScope(s)}
            style={{
              flex: 1,
              padding: spacing(1.5),
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: scope === s ? colors.primary : colors.border,
              backgroundColor: scope === s ? colors.primary : colors.cardAlt,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.text }}>{s === 'SHARED' ? 'Общий' : 'Личный'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, marginBottom: 6 }}>Категория</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(2) }}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={{
              paddingHorizontal: spacing(1.5),
              paddingVertical: spacing(0.75),
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: categoryId === c.id ? (c.color ?? colors.primary) : colors.border,
              backgroundColor: categoryId === c.id ? colors.cardAlt : 'transparent',
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13 }}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={{ color: colors.expense, marginBottom: spacing(1) }}>{error}</Text> : null}
      <Button title="Сохранить расход" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
