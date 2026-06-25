import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
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

const MAX_BASE64_SIZE = 950000;

export default function ScanReceiptScreen({ navigation }: any) {
  const { selectedId, load: loadPortfolios } = usePortfolios();
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadPortfolios().catch(() => {}); }, [loadPortfolios]);
  useEffect(() => { if (selectedId) api.categories(selectedId).then(setCategories).catch(() => {}); }, [selectedId]);

  const importFile = async () => {
    setError(null);
    if (!selectedId) {
      setError('Личный профиль ещё загружается. Подождите пару секунд и попробуйте снова.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['image/*', 'application/pdf'] });
    if (result.canceled) return;
    const asset = result.assets?.[0] as any;
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? asset.mime ?? 'image/jpeg', asset.name ?? 'document');
  };

  const takePhoto = async () => {
    setError(null);
    if (!selectedId) {
      setError('Личный профиль ещё загружается. Подождите пару секунд и попробуйте снова.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к камере. Разрешите доступ в настройках.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: false, quality: 0.5 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await processPickedFile(asset.uri, asset.mimeType ?? 'image/jpeg', 'photo.jpg', asset.width);
  };

  const processPickedFile = async (uri: string, mimeType: string, filename: string, width?: number | null) => {
    if (!selectedId) return;
    setDrafts([]);
    setSelections({});
    setLoading(true);
    setStatusText('Готовлю файл к анализу…');
    setError(null);

    try {
      let fileBase64: string;
      let finalMime = mimeType || 'image/jpeg';
      if (finalMime.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        setStatusText('Читаю PDF-документ…');
        fileBase64 = await readBase64(uri);
        finalMime = 'application/pdf';
        if (fileBase64.length > 3500000) throw new Error('PDF слишком большой для импорта. Сохраните одну страницу или отправьте скрин нужного фрагмента.');
      } else {
        setStatusText('Сжимаю изображение для AI-анализа…');
        const prepared = await prepareImageForImport(uri, width);
        fileBase64 = prepared.base64;
        finalMime = 'image/jpeg';
      }

      setStatusText('ИИ анализирует изображение и ищет операции…');
      const imported = await request<ImportDraft[]>('/ai/import-operations', {
        method: 'POST',
        body: { portfolioId: selectedId, fileBase64, mimeType: finalMime, filename },
      });

      setDrafts(Array.isArray(imported) ? imported : []);
      const initial: Record<string, Selection> = {};
      for (const item of imported ?? []) {
        initial[item.logId] = {
          action: item.suggestedAction ?? (item.operationType === 'income' ? 'income' : item.operationType === 'expense' ? 'expense' : 'skip'),
          categoryId: item.resolvedCategoryId,
        };
      }
      setSelections(initial);
      if (!imported?.length) setError('ИИ не нашёл операций в файле. Попробуйте обрезать скрин до области с суммами или загрузить другой файл.');
    } catch (e: any) {
      const message = e?.status === 413
        ? 'Файл не прошёл лимит даже после сжатия. Я уменьшил лимиты и сжатие, обновите приложение и попробуйте этот же скрин ещё раз.'
        : e.message ?? 'Не удалось импортировать операции. Попробуйте другой файл.';
      setError(message);
    } finally {
      setLoading(false);
      setStatusText(null);
    }
  };

  const updateSelection = (logId: string, patch: Partial<Selection>) => {
    setSelections((current) => ({ ...current, [logId]: { ...(current[logId] ?? { action: 'skip', categoryId: null }), ...patch } }));
  };

  const confirm = async () => {
    const operations = drafts.map((draft) => {
      const selection = selections[draft.logId] ?? { action: 'skip', categoryId: null };
      if (!draft.parsed.amount && selection.action !== 'skip') return { logId: draft.logId, action: 'skip' as OperationAction };
      return { logId: draft.logId, action: selection.action, categoryId: selection.categoryId ?? undefined, comment: selection.comment };
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

      {loading ? (
        <Card style={{ alignItems: 'center', marginBottom: spacing(2) }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.text, marginTop: spacing(1), fontWeight: '600', textAlign: 'center' }}>{statusText ?? 'Импортирую операции…'}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>Превью не показываю: файл только сжимается и отправляется на анализ.</Text>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ borderColor: colors.warning, marginBottom: spacing(2) }}>
          <Text style={{ color: colors.warning, fontWeight: '600' }}>Нужна проверка</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>{error}</Text>
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
                <Row label="Категория" value={draft.parsed.category ?? categories.find((cat) => cat.id === selection.categoryId)?.name ?? 'не распознана'} />
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
                  <CategorySelector categories={categories} value={selection.categoryId} onChange={(categoryId) => updateSelection(draft.logId, { categoryId })} onAddPress={() => navigation.navigate('Categories')} />
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
    { width: width && width < 760 ? width : 760, quality: 0.42 },
    { width: 640, quality: 0.34 },
    { width: 520, quality: 0.28 },
    { width: 420, quality: 0.24 },
  ];
  let last: { uri: string; base64?: string } | null = null;
  for (const variant of variants) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: variant.width } }],
      { compress: variant.quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    last = result;
    if (result.base64 && result.base64.length <= MAX_BASE64_SIZE) return { uri: result.uri, base64: result.base64 };
  }
  if (!last?.base64) throw new Error('Не удалось подготовить изображение для импорта.');
  if (last.base64.length > MAX_BASE64_SIZE) throw new Error('Скрин слишком большой даже после сжатия. Обрежьте лишние поля вокруг списка операций и попробуйте снова.');
  return { uri: last.uri, base64: last.base64 };
}

function ActionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: spacing(0.9), borderRadius: radius.pill, alignItems: 'center', backgroundColor: active ? colors.accent : colors.cardAlt, borderWidth: 1, borderColor: active ? colors.accent : colors.border }}>
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
