import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { Category } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const PALETTE = ['#4F46E5', '#16A34A', '#F59E0B', '#E11D48', '#0EA5E9', '#9333EA', '#EA580C', '#0D9488'];

export default function CategoriesScreen() {
  const { selectedId } = usePortfolios();
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setItems(await api.categories(selectedId));
    } catch {
      setItems([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!selectedId || !name.trim()) return;
    setBusy(true);
    try {
      await api.createCategory(selectedId, { name: name.trim(), color });
      setName('');
      load();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const disable = (c: Category) => {
    Alert.alert('Отключить категорию', `Скрыть «${c.name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отключить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteCategory(c.id);
            load();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message ?? 'Не удалось');
          }
        },
      },
    ]);
  };

  const system = items.filter((c) => c.isSystem);
  const custom = items.filter((c) => !c.isSystem);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Категории</ScreenTitle>

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: spacing(1) }}>Новая категория</Text>
        <Field value={name} onChangeText={setName} placeholder="Например: Дом" />
        <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(1.5) }}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 0,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
        <Button title="Добавить" onPress={add} loading={busy} />
      </Card>

      {custom.length > 0 ? (
        <>
          <Text style={[label, { marginTop: spacing(2.5) }]}>Мои категории</Text>
          {custom.map((c) => (
            <Row key={c.id} c={c} onLong={() => disable(c)} canDisable />
          ))}
        </>
      ) : null}

      <Text style={[label, { marginTop: spacing(2.5) }]}>Системные категории</Text>
      {system.map((c) => (
        <Row key={c.id} c={c} />
      ))}
    </ScrollView>
  );
}

function Row({ c, onLong, canDisable }: { c: Category; onLong?: () => void; canDisable?: boolean }) {
  return (
    <Pressable onLongPress={onLong} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(1.25) }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color ?? colors.primary, marginRight: spacing(1.5) }} />
      <Text style={{ color: colors.text, flex: 1 }}>{c.name}</Text>
      {canDisable ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>удержать для отключения</Text> : null}
    </Pressable>
  );
}

const label = { color: colors.textMuted, fontSize: 13, marginBottom: spacing(0.5) } as const;
