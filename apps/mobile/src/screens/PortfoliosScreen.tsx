import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { request } from '../api/client';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, IconBubble, ScreenTitle, appFont } from '../components/ui';
import { TYPE_LABELS } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

export default function PortfoliosScreen() {
  const { portfolios, load, select, selectedId } = usePortfolios();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
      const portfolio = await api.createPortfolio({ name: cleanName, type: 'SHARED' });
      await load();
      choosePortfolio(portfolio.id);
      setName('');
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
  };

  const saveName = async (portfolioId: string) => {
    const cleanName = editingName.trim();
    if (!cleanName) {
      Alert.alert('Название портфеля', 'Название не может быть пустым.');
      return;
    }
    setBusy(true);
    try {
      await request(`/portfolios/${portfolioId}`, { method: 'PATCH', body: { name: cleanName } });
      await load();
      setEditingId(null);
      setEditingName('');
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось изменить название');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Профиль хранит личные данные. Портфель объединяет двух и более участников.">Портфели</ScreenTitle>
        <Pressable
          onPress={() => setIsCreating((v) => !v)}
          style={({ pressed }) => [
            {
              backgroundColor: colors.primary,
              borderRadius: radius.pill,
              paddingHorizontal: spacing(1.5),
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={{ color: '#fff', fontFamily: appFont, fontWeight: '600' }}>+ Создать</Text>
        </Pressable>
      </View>

      {isCreating ? (
        <Card style={{ marginBottom: spacing(1.5) }}>
          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '600', marginBottom: spacing(1.5) }}>
            Новый общий портфель
          </Text>
          <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Семейный" />
          <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: -spacing(0.75), marginBottom: spacing(1) }}>
            Личные доходы и расходы остаются в профиле пользователя. Портфель нужен, чтобы объединить данные участников.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
            <View style={{ flex: 1 }}>
              <Button title="Отмена" variant="ghost" onPress={() => setIsCreating(false)} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Создать" onPress={create} loading={busy} />
            </View>
          </View>
        </Card>
      ) : null}

      <FlatList
        data={portfolios}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={{ height: spacing(1.5) }} />}
        contentContainerStyle={{ paddingBottom: spacing(10) }}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          const isPersonal = item.type === 'PERSONAL';
          const members = item.members ?? [];
          const memberCount = members.length || 1;
          const isSelecting = selectingId === item.id;
          const isEditing = editingId === item.id;

          return (
            <Card style={{ borderColor: active ? colors.primary : colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name={isPersonal ? 'wallet' : 'users'} color={isPersonal ? colors.primary : '#7C3AED'} bg={isPersonal ? colors.primarySoft : colors.violetSoft} />
                <View style={{ flex: 1 }}>
                  {isEditing ? (
                    <Field label="Название портфеля" value={editingName} onChangeText={setEditingName} placeholder="Название" />
                  ) : (
                    <>
                      <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '600' }}>{item.name}</Text>
                      <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 2 }}>
                        {TYPE_LABELS[item.type] ?? item.type} · {memberCount} участн. · {item.currency}
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
                <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 13, fontWeight: '600', marginBottom: spacing(0.75) }}>
                  Участники портфеля
                </Text>
                {members.length ? (
                  <View style={{ gap: spacing(0.75) }}>
                    {members.map((member: any) => (
                      <View key={member.user?.id ?? member.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                        <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 13, fontWeight: '600' }}>
                          {member.user?.name ?? 'Пользователь'}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12 }}>
                          {member.role === 'OWNER' ? 'владелец' : 'участник'} · {member.accessLevel ?? 'FULL'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12 }}>
                    Сейчас в портфеле только владелец. После приглашения партнёры появятся здесь.
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={active ? (isSelecting ? 'Выбрано' : 'Текущий') : 'Выбрать'}
                    variant={active ? 'ghost' : 'primary'}
                    onPress={() => choosePortfolio(item.id)}
                    disabled={isSelecting}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={isEditing ? 'Сохранить' : 'Переименовать'} variant="ghost" onPress={() => isEditing ? saveName(item.id) : startEdit(item)} loading={busy && isEditing} />
                </View>
              </View>
              <View style={{ marginTop: spacing(1) }}>
                <Button title="Пригласить участника" variant="ghost" onPress={() => invite(item.id)} />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, fontFamily: appFont }}>Портфелей пока нет.</Text>}
      />
    </View>
  );
}

function normalizeInviteUrl(url: string, token: string) {
  const webOrigin = (globalThis as any)?.location?.origin;
  const base = webOrigin && !String(webOrigin).includes('familyfinance-application')
    ? String(webOrigin)
    : 'https://familyfinance-appfront.vercel.app';
  const extractedToken = token || url.split('/invite/')[1] || url.split('/').pop();
  return `${base.replace(/\/$/, '')}/invite/${extractedToken}`;
}
