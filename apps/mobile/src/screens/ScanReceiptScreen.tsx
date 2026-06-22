import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api/endpoints';
import { Category, RecognitionDraft } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export default function ScanReceiptScreen({ navigation }: any) {
  const { selectedId } = usePortfolios();
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecognitionDraft | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedId) api.categories(selectedId).then(setCategories).catch(() => {});
  }, [selectedId]);

  const pick = async (fromCamera: boolean) => {
    if (!selectedId) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к камере/галерее в настройках.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    setPreview(asset.uri);
    setLoading(true);
    setDraft(null);
    try {
      const d = await api.recognizeImage(selectedId, asset.base64!, asset.mimeType ?? 'image/jpeg');
      setDraft(d);
      setCategoryId(d.resolvedCategoryId);
    } catch (e: any) {
      Alert.alert('Ошибка распознавания', e.message ?? 'Попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (force = false) => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.confirmRecognition({ logId: draft.logId, categoryId: categoryId ?? undefined, force });
      Alert.alert('Готово', 'Расход добавлен в портфель.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось добавить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Сканировать чек</ScreenTitle>

      <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <Button title="📷 Камера" onPress={() => pick(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="🖼 Галерея" variant="ghost" onPress={() => pick(false)} />
        </View>
      </View>

      {preview ? (
        <Image
          source={{ uri: preview }}
          style={{ width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing(2) }}
          resizeMode="cover"
        />
      ) : null}

      {loading ? (
        <View style={{ alignItems: 'center', padding: spacing(3) }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, marginTop: spacing(1) }}>Распознаю чек…</Text>
        </View>
      ) : null}

      {draft ? (
        <Card style={draft.duplicateOf ? { borderColor: colors.warning } : undefined}>
          {draft.duplicateOf ? (
            <Text style={{ color: colors.warning, marginBottom: spacing(1) }}>
              ⚠️ Похожий расход уже есть.
            </Text>
          ) : null}
          <Row label="Сумма" value={draft.parsed.amount ? `${fmt(draft.parsed.amount)} ₽` : '—'} />
          <Row label="Продавец" value={draft.parsed.merchant ?? draft.parsed.description ?? '—'} />
          <Row label="Дата" value={draft.parsed.date ?? new Date().toISOString().slice(0, 10)} />
          <Row label="Уверенность" value={`${draft.parsed.confidence}%`} />

          {draft.parsed.clarificationQuestion ? (
            <Text style={{ color: colors.warning, marginTop: spacing(1) }}>
              {draft.parsed.clarificationQuestion}
            </Text>
          ) : null}

          <Text style={{ color: colors.textMuted, marginTop: spacing(1.5), marginBottom: 6, fontSize: 13 }}>
            Категория
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
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

          <View style={{ marginTop: spacing(2) }}>
            {draft.parsed.amount ? (
              <Button
                title={draft.duplicateOf ? 'Всё равно добавить' : 'Добавить расход'}
                onPress={() => confirm(!!draft.duplicateOf)}
                loading={saving}
              />
            ) : (
              <Button title="Добавить вручную" variant="ghost" onPress={() => navigation.replace('AddExpense')} />
            )}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
