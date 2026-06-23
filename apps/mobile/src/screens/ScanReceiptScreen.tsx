import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api/endpoints';
import { Category, RecognitionDraft } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const MAX_OCR_WIDTH = 1200;
const OCR_QUALITY = 0.45;

export default function ScanReceiptScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecognitionDraft | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolios().catch(() => {});
  }, [loadPortfolios]);

  useEffect(() => {
    if (selectedId) api.categories(selectedId).then(setCategories).catch(() => {});
  }, [selectedId]);

  const pick = async (fromCamera: boolean) => {
    setError(null);
    if (!selectedId) {
      setError('Сначала создайте или выберите портфель. Без портфеля чек некуда добавить.');
      return;
    }
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к камере/галерее. Разрешите доступ в настройках.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: false, quality: 0.65 })
      : await ImagePicker.launchImageLibraryAsync({ base64: false, quality: 0.65 });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setError('Изображение выбрано, но приложение не получило файл для распознавания. Попробуйте выбрать другой файл или сделать фото через камеру.');
      return;
    }

    setPreview(asset.uri);
    setLoading(true);
    setStatusText('Сжимаю изображение перед распознаванием…');
    setDraft(null);
    setCategoryId(null);
    try {
      const prepared = await prepareImageForOcr(asset.uri, asset.width);
      setPreview(prepared.uri);
      setStatusText('Отправляю чек на распознавание…');
      const d = await api.recognizeImage(selectedId, prepared.base64, 'image/jpeg');
      setDraft(d);
      setCategoryId(d.resolvedCategoryId);
      setStatusText(null);

      if (!d.parsed.amount) {
        setError(d.parsed.clarificationQuestion ?? 'Чек загрузился, но сумму распознать не удалось. Можно добавить расход вручную.');
      }
    } catch (e: any) {
      const message = e?.status === 413
        ? 'Фото всё ещё слишком большое для отправки. Попробуйте обрезать чек или выбрать скриншот меньшего размера.'
        : e.message ?? 'Не удалось распознать чек. Попробуйте ещё раз или добавьте расход вручную.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (force = false) => {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      await api.confirmRecognition({ logId: draft.logId, categoryId: categoryId ?? undefined, force });
      navigation.navigate('Расходы');
    } catch (e: any) {
      setError(e.message ?? 'Не удалось добавить расход');
    } finally {
      setSaving(false);
    }
  };

  const addManual = () => {
    navigation.replace('AddExpense', {
      expense: draft?.parsed?.amount
        ? {
            amount: String(draft.parsed.amount),
            title: draft.parsed.merchant ?? draft.parsed.description ?? '',
            merchant: draft.parsed.merchant ?? undefined,
            date: draft.parsed.date ?? new Date().toISOString(),
            categoryId: categoryId ?? undefined,
            scope: 'SHARED',
          }
        : undefined,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle subtitle="Фото чека или банковского уведомления">Сканировать чек</ScreenTitle>

      <View style={{ flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(2) }}>
        <View style={{ flex: 1 }}>
          <Button title="Камера" icon="camera" onPress={() => pick(true)} disabled={loading || saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Галерея" icon="receipt" variant="ghost" onPress={() => pick(false)} disabled={loading || saving} />
        </View>
      </View>

      {!selectedId ? (
        <Card style={{ borderColor: colors.warning, marginBottom: spacing(2) }}>
          <Text style={{ color: colors.warning, fontWeight: '600' }}>Портфель не выбран</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>Создайте или выберите портфель, чтобы добавлять чеки.</Text>
        </Card>
      ) : null}

      {preview ? (
        <Image
          source={{ uri: preview }}
          style={{ width: '100%', height: 220, borderRadius: radius.lg, marginBottom: spacing(2), backgroundColor: colors.cardAlt }}
          resizeMode="cover"
        />
      ) : null}

      {loading ? (
        <Card style={{ alignItems: 'center', marginBottom: spacing(2) }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.text, marginTop: spacing(1), fontWeight: '600' }}>{statusText ?? 'Распознаю чек…'}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>Обычно это занимает несколько секунд.</Text>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ borderColor: colors.warning, marginBottom: spacing(2) }}>
          <Text style={{ color: colors.warning, fontWeight: '600' }}>Нужна проверка</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>{error}</Text>
          <View style={{ marginTop: spacing(1.5) }}>
            <Button title="Добавить вручную" variant="ghost" onPress={addManual} />
          </View>
        </Card>
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

          <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
            {draft.parsed.amount ? (
              <Button
                title={draft.duplicateOf ? 'Всё равно добавить' : 'Добавить расход'}
                onPress={() => confirm(!!draft.duplicateOf)}
                loading={saving}
              />
            ) : null}
            <Button title="Заполнить вручную" variant="ghost" onPress={addManual} disabled={saving} />
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

async function prepareImageForOcr(uri: string, width?: number | null): Promise<{ uri: string; base64: string }> {
  const resizeWidth = width && width > MAX_OCR_WIDTH ? MAX_OCR_WIDTH : undefined;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    resizeWidth ? [{ resize: { width: resizeWidth } }] : [],
    {
      compress: OCR_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!result.base64) {
    throw new Error('Не удалось подготовить изображение для распознавания.');
  }

  return { uri: result.uri, base64: result.base64 };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: spacing(1) }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
