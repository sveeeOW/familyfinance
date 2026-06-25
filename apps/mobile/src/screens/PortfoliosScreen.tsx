import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, IconBubble, ScreenTitle, appFont } from '../components/ui';
import { TYPE_LABELS } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

const ICON_COLORS = ['#7C3AED', '#2563EB', '#059669', '#F59E0B', '#EF4444', '#0F766E'];

function colorFromDescription(description?: string | null) {
  const value = description?.split('[iconColor:')[1]?.split(']')[0];
  return value || '#7C3AED';
}

function descriptionWithColor(color: string) {
  return `[iconColor:${color}]`;
}

function isSharedPortfolio(portfolio: any) {
  return portfolio.type !== 'PERSONAL' || (portfolio.members?.length ?? 0) > 1;
}

export default function PortfoliosScreen() {
  const { portfolios, load, select, selectedId } = usePortfolios();
  const sharedPortfolios = useMemo(() => portfolios.filter(isSharedPortfolio), [portfolios]);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [iconColor, setIconColor] = useState(ICON_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState(ICON_COLORS[0]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const choosePortfolio = useCallback((portfolioId: string) => {
    setSelectingId(portfolioId);
    select(portfolioId);
    setTimeout(() => setSelectingId(null), 450);
  }, [select]);

  const invite = async (portfolioId: string) => {
    try {
      const { url, token } = await api.createInvite(portfolioId);
      const shareUrl = normalizeInviteUrl(url, token);
      await Share.share({ message: `Приглашаю в портфель Family Finance: ${shareUrl}` });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать приглашение');
    }
  };

  const create = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      Alert.alert('Название портфеля', 'Введите название портфеля.');
      return;
    }
    setBusy(true);
    try {
      const portfolio = await api.createPortfolio({ name: cleanName, type: 'SHARED', description: descriptionWithColor(iconColor) } as any);
      await load();
      choosePortfolio(portfolio.id);
      setName('');
      setIconColor(ICON_COLORS[0]);
      setIsCreating(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать портфель');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (portfolio: any) => {
    setEditingId(portfolio.id);
    setEditingName(portfolio.name);
    setEditingColor(colorFromDescription(portfolio.description));
  };

  const savePortfolio = async (portfolioId: string) => {
    const cleanName = editingName.trim();
    if (!cleanName) {
      Alert.alert('Название портфеля', 'Название не может быть пустым.');
      return;
    }
    setBusy(true);
    try {
      await request(`/portfolios/${portfolioId}`, { method: 'PATCH', body: { name: cleanName, description: descriptionWithColor(editingColor) } });
      await load();
      setEditingId(null);
      setEditingName('');
      setEditingColor(ICON_COLORS[0]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось изменить портфель');
    } finally {
      setBusy(false);
    }
  };

  const removePortfolio = (portfolioId: string, portfolioName: string) => {
    Alert.alert('Удалить портфель?', `Портфель «${portfolioName}» будет удалён вместе с его общими данными.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await request(`/portfolios/${portfolioId}`, { method: 'DELETE' });
            await load();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message ?? 'Не удалось удалить портфель');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Профиль работает всегда. Портфель нужен для объединения пользователей.">Портфели</ScreenTitle>
        <Pressable
          onPress={() => setIsCreating((v) => !v)}
          style={({ pressed }) => [
            { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing(1.5), height: 42, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={{ color: '#fff', fontFamily: appFont, fontWeight: '600' }}>+ Создать</Text>
        </Pressable>
      </View>

      {isCreating ? (
        <Card style={{ marginBottom: spacing(1.5) }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '600', marginBottom: spacing(1.5) }}>Новый портфель</Text>
          <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Семейный" />
          <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 13, fontWeight: '600', marginBottom: spacing(0.75) }}>Цвет иконки</Text>
          <ColorDots value={iconColor} onChange={setIconColor} />
          <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: spacing(1) }}>
            Личные доходы и расходы уже доступны в профиле. Здесь создаётся общий портфель для нескольких пользователей.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
            <View style={{ flex: 1 }}><Button title="Отмена" variant="ghost" onPress={() => setIsCreating(false)} disabled={busy} /></View>
            <View style={{ flex: 1 }}><Button title="Создать" onPress={create} loading={busy} /></View>
          </View>
        </Card>
      ) : null}

      <FlatList
        data={sharedPortfolios}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={{ height: spacing(1.5) }} />}
        contentContainerStyle={{ paddingBottom: spacing(10) }}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          const members = item.members ?? [];
          const isSelecting = selectingId === item.id;
          const isEditing = editingId === item.id;
          const visualColor = isEditing ? editingColor : colorFromDescription(item.description);

          return (
            <Card style={{ borderColor: active ? colors.primary : colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name="users" color={visualColor} bg={colors.violetSoft} />
                <View style={{ flex: 1 }}>
                  {isEditing ? (
                    <>
                      <Field label="Название портфеля" value={editingName} onChangeText={setEditingName} placeholder="Название" />
                      <ColorDots value={editingColor} onChange={setEditingColor} />
                    </>
                  ) : (
                    <>
                      <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '600' }}>{item.name}</Text>
                      <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 2 }}>
                        {TYPE_LABELS[item.type] ?? item.type} · {members.length || 1} участн. · {item.currency}
                      </Text>
                    </>
                  )}
                </View>
                {active ? (
                  <View style={{ paddingHorizontal: spacing(1), paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft }}>
                    <Text style={{ color: colors.primary, fontFamily: appFont, fontSize: 12, fontWeight: '600' }}>выбран</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ marginTop: spacing(1.5), padding: spacing(1.25), borderRadius: radius.md, backgroundColor: colors.cardAlt }}>
                <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 13, fontWeight: '600', marginBottom: spacing(0.75) }}>Участники портфеля</Text>
                {members.length ? members.map((member: any) => (
                  <View key={member.user?.id ?? member.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 13, fontWeight: '600' }}>{member.user?.name ?? 'Пользователь'}</Text>
                    <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12 }}>{member.role === 'OWNER' ? 'владелец' : 'участник'}</Text>
                  </View>
                )) : <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12 }}>После приглашения участники появятся здесь.</Text>}
              </View>

              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <View style={{ flex: 1 }}><Button title={active ? (isSelecting ? 'Выбрано' : 'Текущий') : 'Выбрать'} variant={active ? 'ghost' : 'primary'} onPress={() => choosePortfolio(item.id)} disabled={isSelecting} /></View>
                <View style={{ flex: 1 }}><Button title={isEditing ? 'Сохранить' : 'Изменить'} variant="ghost" onPress={() => isEditing ? savePortfolio(item.id) : startEdit(item)} loading={busy && isEditing} /></View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) }}>
                <View style={{ flex: 1 }}><Button title="Пригласить" variant="ghost" onPress={() => invite(item.id)} /></View>
                <View style={{ flex: 1 }}><Button title="Удалить" variant="danger" onPress={() => removePortfolio(item.id, item.name)} disabled={busy} /></View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <Card>
            <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 16, fontWeight: '600' }}>Общих портфелей пока нет</Text>
            <Text style={{ color: colors.textMuted, fontFamily: appFont, marginTop: 6 }}>Доходы и расходы можно вести в профиле уже сейчас. Создайте портфель, чтобы пригласить партнёра и объединить статистику.</Text>
            <View style={{ marginTop: spacing(1.5) }}>
              <Button title="Создать портфель" onPress={() => setIsCreating(true)} />
            </View>
          </Card>
        }
      />
    </View>
  );
}

function ColorDots({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(1) }}>
      {ICON_COLORS.map((color) => (
        <Pressable key={color} onPress={() => onChange(color)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: value === color ? 3 : 1, borderColor: value === color ? colors.text : colors.border }} />
      ))}
    </View>
  );
}

function normalizeInviteUrl(url: string, token: string) {
  const webOrigin = (globalThis as any)?.location?.origin;
  const base = webOrigin && !String(webOrigin).includes('familyfinance-application') ? String(webOrigin) : 'https://familyfinance-appfront.vercel.app';
  const extractedToken = token || url.split('/invite/')[1] || url.split('/').pop();
  return `${base.replace(/\/$/, '')}/invite/${extractedToken}`;
}
