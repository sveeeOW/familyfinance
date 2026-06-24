import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { request } from '../api/client';
import { api } from '../api/endpoints';
import { Category } from '../api/types';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { CategorySelector } from '../components/CategorySelector';
import { colors, radius, spacing } from '../theme';

type OperationAction = 'expense' | 'income' | 'skip';

type ImportDraft = {
  logId: string;
  portfolioId: string;
  operationType: 'expense' | 'income' | 'transfer' | 'unknown';
  suggestedAction: OperationAction;
  parsed: {
    amount: number | null;
    currency: string;
    date: string | null;
    merchant: string | null;
    description: string | null;
    category: string | null;
    confidence: number;
    needsClarification: boolean;
    clarificationQuestion: string | null;
  };
  resolvedCategoryId: string | null;
  duplicateOf: string | null;
};

type Selection = { action: OperationAction; categoryId: string | null; comment?: string };

const MAX_IMPORT_WIDTH = 1100;
const MAX_BASE64_SIZE = 2800000;

export default function ScanReceiptScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [preview, setPreview] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [categories, setCategories] = useState<Category[]>([]);
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

  const importFile = async () => {
    setError(null);
    if (!selectedId) {
      setError('Сначала создайте или выберите портфель. Без портфеля операции некуда добавить.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/*', 'application/pdf'],
    });
    if (result.canceled) return;
    const asset = result.assets?.[0] as any;
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? asset.mime ?? 'image/jpeg', asset.name ?? 'document');
  };

  const takePhoto = async () => {
    setError(null);
    if (!selectedId) {
      setError('Сначала создайте или выберите портфель. Без портфеля операции некуда добавить.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к камере. Разрешите доступ в настройках.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: false, quality: 0.65 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? 'image/jpeg', 'photo.jpg', asset.width);
  };

  const processPickedFile = async (uri: string, mimeType: string, filename: string, width?: number | null) => {
    if (!selectedId) return;
    setPreview(mimeType.includes('pdf') ? null : uri);
    setDrafts([]);
    setSelections({});
    setLoading(true);
    setStatusText('Готовлю файл к импорту…');

    try {
      let fileBase64: string;
      let finalMime = mimeType || 'image/jpeg';
      if (finalMime.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        setStatusText('Читаю PDF-документ…');
        fileBase64 = await readBase64(uri);
        finalMime = 'application/pdf';
      } else {
        setStatusText('Сжимаю изображение без сохранения файла…');
        const prepared = await prepareImageForImport(uri, width);
        fileBase64 = prepared.base64;
        finalMime = 'image/jpeg';
        setPreview(prepared.uri);
      }

      if (fileBase64.length > MAX_BASE64_SIZE && !finalMime.includes('pdf')) {
        setError('Изображение всё ещё крупное. Я попробовал сжать его автоматически, но файл может не пройти лимит Vercel. Попробуйте обрезать лишние поля или отправить PDF/скрин меньшего размера.');
      }

      setStatusText('ИИ ищет операции в документе…');
      const imported = await request<ImportDraft[]>('/ai/import-operations', {
        method: 'POST',
        body: { portfolioId: selectedId, fileBase64, mimeType: finalMime, filename },
      });

      setDrafts(imported);
      const initial: Record<string, Selection> = {};
      for (const item of imported) {
        initial[item.logId] = {
          action: item.suggestedAction ?? (item.operationType === 'income' ? 'income' : item.operationType === 'expense' ? 'expense' : 'skip'),
          categoryId: item.resolvedCategoryId,
        };
      }
      setSelections(initial);
      if (!imported.length) {
        setError('ИИ не нашёл операций. Попробуйте другой файл или добавьте расход вручную.');
      }
    } catch (e: any) {
      const message = e?.status === 413
        ? 'Файл слишком большой для текущего лимита Vercel. Следующий шаг — резать длинные скрины на части перед отправкой. Пока попробуйте PDF или скрин меньшего размера.'
        : e.message ?? 'Не удалось импортировать операции. Попробуйте другой файл или добавьте вручную.';
      setError(message);
    } finally {
      setLoading(false);
      setStatusText(null);
    }
  };

  const updateSelection = (logId: string, patch: Partial<Selection>) => {
    setSelections((current) => ({
      ...current,
      [logId]: { ...(current[logId] ?? { action: 'skip', categoryId: null }), ...patch },
    }));
  };

  const confirm = async () => {
    const operations = drafts.map((draft) => {
      const selection = selections[draft.logId] ?? { action: 'skip', categoryId: null };
      if (!draft.parsed.amount && selection.action !== 'skip') {
        return { logId: draft.logId, action: 'skip' as OperationAction };
      }
      return {
        logId: draft.logId,
        action: selection.action,
        categoryId: selection.categoryId ?? undefined,
        comment: selection.comment,
      };
    });
    if (!operations.some((operation) => operation.action !== 'skip')) {
      setError('Выберите хотя бы одну операцию для добавления.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request('/ai/confirm-import-operations', { method: 'POST', body: { operations } });
      navigation.navigate('Расходы');
    } catch (e: any) {
      setError(e.message ?? 'Не удалось добавить операции');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle subtitle="Скрин, фото, PDF-квитанция или выписка">Импорт операций</ScreenTitle>

      <View style={{ gap: spacing(1), marginBottom: spacing(2) }}>
        <Button title="Импортировать файл" icon="receipt" onPress={importFile} disabled={loading || saving} />
        <Button title="Сделать фото" icon="camera" variant="ghost" onPress={takePhoto} disabled={loading || saving} />
      </View>

      {!selectedId ? (
        <Card style={{ borderColor: colors.warning, marginBottom: spacing(2) }}>
          <Text style={{ color: colors.warning, fontWeight: '600' }}>Портфель не выбран</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>Создайте или выберите портфель, чтобы импортировать операции.</Text>
        </Card>
      ) : null}

      {preview ? (
        <Image source={{ uri: preview }} style={{ width: '100%', height: 220, borderRadius: radius.lg, marginBottom: spacing(2), backgroundColor: colors.cardAlt }} resizeMode="cover" />
      ) : null}

      {loading ? (
        <Card style={{ alignItems: 'center', marginBottom: spacing(2) }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.text, marginTop: spacing(1), fontWeight: '600', textAlign: 'center' }}>{statusText ?? 'Импортирую операции…'}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>Файл не сохраняется — используется только для распознавания.</Text>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ borderColor: colors.warning, marginBottom: spacing(2) }}>
          <Text style={{ color: colors.warning, fontWeight: '600' }}>Нужна проверка</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>{error}</Text>
          <View style={{ marginTop: spacing(1.5) }}>
            <Button title="Добавить расход вручную" variant="ghost" onPress={() => navigation.navigate('AddExpense')} />
          </View>
        </Card>
      ) : null}

      {drafts.length ? (
        <View style={{ gap: spacing(1.25), marginBottom: spacing(2) }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 19 }}>Найденные операции</Text>
          {drafts.map((draft, index) => {
            const selection = selections[draft.logId] ?? { action: draft.suggestedAction, categoryId: draft.resolvedCategoryId };
            return (
              <Card key={draft.logId} style={draft.duplicateOf ? { borderColor: colors.warning } : undefined}>
                <Text style={{ color: colors.textMuted, fontWeight: '600', marginBottom: 6 }}>Операция {index + 1}</Text>
                {draft.duplicateOf ? <Text style={{ color: colors.warning, marginBottom: 6 }}>Похожая операция уже есть.</Text> : null}
                <Row label="Сумма" value={draft.parsed.amount ? `${fmt(draft.parsed.amount)} ₽` : 'не распознана'} />
                <Row label="Описание" value={draft.parsed.merchant ?? draft.parsed.description ?? '—'} />
                <Row label="Дата" value={draft.parsed.date ?? '—'} />
                <Row label="Уверенность" value={`${draft.parsed.confidence}%`} />
                {draft.parsed.clarificationQuestion ? <Text style={{ color: colors.warning, marginTop: 8 }}>{draft.parsed.clarificationQuestion}</Text> : null}

                <Text style={{ color: colors.textMuted, fontWeight: '600', marginTop: spacing(1.5), marginBottom: 6 }}>Что это?</Text>
                <View style={{ flexDirection: 'row', gap: spacing(0.75), marginBottom: spacing(1.5) }}>
                  <ActionChip label="Расход" active={selection.action === 'expense'} onPress={() => updateSelection(draft.logId, { action: 'expense' })} />
                  <ActionChip label="Доход" active={selection.action === 'income'} onPress={() => updateSelection(draft.logId, { action: 'income' })} />
                  <ActionChip label="Не учитывать" active={selection.action === 'skip'} onPress={() => updateSelection(draft.logId, { action: 'skip' })} />
                </View>

                {selection.action === 'expense' ? (
                  <CategorySelector
                    categories={categories}
                    value={selection.categoryId}
                    onChange={(categoryId) => updateSelection(draft.logId, { categoryId })}
                    onAddPress={() => navigation.navigate('Categories')}
                  />
                ) : null}
              </Card>
            );
          })}
          <Button title="Добавить выбранные операции" onPress={confirm} loading={saving} />
        </View>
      ) : null}
    </ScrollView>
  );
}

async function readBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function prepareImageForImport(uri: string, width?: number | null): Promise<{ uri: string; base64: string }> {
  const variants = [
    { width: width && width > MAX_IMPORT_WIDTH ? MAX_IMPORT_WIDTH : undefined, quality: 0.42 },
    { width: 900, quality: 0.32 },
    { width: 700, quality: 0.25 },
  ];
  let last: { uri: string; base64?: string } | null = null;
  for (const variant of variants) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      variant.width ? [{ resize: { width: variant.width } }] : [],
      { compress: variant.quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    last = result;
    if (result.base64 && result.base64.length <= MAX_BASE64_SIZE) return { uri: result.uri, base64: result.base64 };
  }
  if (!last?.base64) throw new Error('Не удалось подготовить изображение для импорта.');
  return { uri: last.uri, base64: last.base64 };
}

function ActionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: spacing(0.9),
        borderRadius: radius.pill,
        alignItems: 'center',
        backgroundColor: active ? colors.accent : colors.cardAlt,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <Text style={{ color: active ? colors.accentText : colors.textMuted, fontWeight: '600', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
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
