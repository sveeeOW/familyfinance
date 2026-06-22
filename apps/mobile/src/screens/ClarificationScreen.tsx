import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Category, Expense } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export default function ClarificationScreen() {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [list, cats] = await Promise.all([
        api.needsClarification(selectedId),
        api.categories(selectedId),
      ]);
      setItems(list);
      setCategories(cats);
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirm = async (item: Expense) => {
    const categoryId = choice[item.id] ?? item.category?.id;
    if (!categoryId) {
      Alert.alert('Выберите категорию', 'Укажите категорию перед подтверждением.');
      return;
    }
    setBusyId(item.id);
    try {
      await api.clarifyExpense(item.id, { categoryId });
      setItems((prev) => prev.filter((e) => e.id !== item.id));
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось подтвердить');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Требует уточнения</ScreenTitle>
      {items.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>Нет расходов, требующих уточнения. 🎉</Text>
      ) : null}

      {items.map((item) => {
        const selected = choice[item.id] ?? item.category?.id;
        return (
          <Card key={item.id} style={{ marginBottom: spacing(2), borderColor: colors.warning }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                {new Intl.NumberFormat('ru-RU').format(Number(item.amount))} ₽
              </Text>
              <Text style={{ color: colors.textMuted }}>{new Date(item.date).toLocaleDateString('ru-RU')}</Text>
            </View>
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>
              {item.merchant ?? item.title ?? 'Описание отсутствует'}
            </Text>

            <Text style={{ color: colors.textMuted, marginTop: spacing(1.5), marginBottom: 6, fontSize: 13 }}>
              Категория
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setChoice((prev) => ({ ...prev, [item.id]: c.id }))}
                  style={{
                    paddingHorizontal: spacing(1.5),
                    paddingVertical: spacing(0.75),
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: selected === c.id ? (c.color ?? colors.primary) : colors.border,
                    backgroundColor: selected === c.id ? colors.cardAlt : 'transparent',
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 13 }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: spacing(2) }}>
              <Button title="Подтвердить" onPress={() => confirm(item)} loading={busyId === item.id} />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
