import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { AccessLevel, PortfolioMember } from '../api/types';
import { useAuth } from '../store/auth';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

const ACCESS: { key: AccessLevel; label: string }[] = [
  { key: 'FULL', label: 'Полный' },
  { key: 'LIMITED', label: 'Ограниченный' },
  { key: 'VIEW_ONLY', label: 'Просмотр' },
  { key: 'PRIVATE', label: 'Личный режим' },
];

export default function ParticipantsScreen() {
  const { selectedId } = usePortfolios();
  const { user } = useAuth();
  const [members, setMembers] = useState<PortfolioMember[]>([]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    try {
      setMembers(await api.members(selectedId));
    } catch {
      setMembers([]);
    }
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = members.find((m) => m.user.id === user?.id)?.role === 'OWNER';

  const setAccess = async (m: PortfolioMember, accessLevel: AccessLevel) => {
    if (!selectedId) return;
    try {
      await api.updateMember(selectedId, m.id, { accessLevel });
      load();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось обновить');
    }
  };

  const remove = (m: PortfolioMember) => {
    if (!selectedId) return;
    Alert.alert('Удалить участника', `Убрать ${m.user.name} из портфеля?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeMember(selectedId, m.id);
            load();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message ?? 'Не удалось');
          }
        },
      },
    ]);
  };

  const invite = async () => {
    if (!selectedId) return;
    try {
      const { url } = await api.createInvite(selectedId);
      await Share.share({ message: `Приглашаю в портфель Family Finance: ${url}` });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать приглашение');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Участники</ScreenTitle>

      {members.map((m) => (
        <Card key={m.id} style={{ marginBottom: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {m.user.name}
                {m.user.id === user?.id ? ' (вы)' : ''}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {m.role === 'OWNER' ? 'Владелец' : 'Участник'} · {m.user.email ?? ''}
              </Text>
            </View>
            {isOwner && m.role !== 'OWNER' ? (
              <Pressable onPress={() => remove(m)} hitSlop={10}>
                <Text style={{ color: colors.expense, fontSize: 13 }}>удалить</Text>
              </Pressable>
            ) : null}
          </View>

          {isOwner && m.role !== 'OWNER' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1.5) }}>
              {ACCESS.map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => setAccess(m, a.key)}
                  style={{
                    paddingHorizontal: spacing(1.25),
                    paddingVertical: spacing(0.5),
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: m.accessLevel === a.key ? colors.primary : colors.border,
                    backgroundColor: m.accessLevel === a.key ? colors.cardAlt : 'transparent',
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 12 }}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
              Доступ: {ACCESS.find((a) => a.key === m.accessLevel)?.label ?? m.accessLevel}
            </Text>
          )}
        </Card>
      ))}

      {isOwner ? (
        <View style={{ marginTop: spacing(1) }}>
          <Button title="Пригласить участника" onPress={invite} />
        </View>
      ) : null}
    </ScrollView>
  );
}
