import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, Field, IconBubble, ScreenTitle, SegmentedControl, appFont } from '../components/ui';
import { TYPE_LABELS } from '../components/PortfolioPicker';
import { colors, radius, spacing } from '../theme';

export default function PortfoliosScreen() {
  const { portfolios, load, select, selectedId } = usePortfolios();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'PERSONAL' | 'SHARED'>('SHARED');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      const portfolio = await api.createPortfolio({ name: cleanName, type });
      await load();
      select(portfolio.id);
      setName('');
      setType('SHARED');
      setIsCreating(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать портфель');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing(1.5) }}>
        <ScreenTitle subtitle="Личные и общие пространства для учёта денег">Портфели</ScreenTitle>
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
            Новый портфель
          </Text>
          <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Семейный" />
          <SegmentedControl
            value={type}
            onChange={setType}
            options={[
              { label: 'Общий', value: 'SHARED' },
              { label: 'Личный', value: 'PERSONAL' },
            ]}
          />
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
          return (
            <Card style={{ borderColor: active ? colors.primary : colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                <IconBubble name={isPersonal ? 'wallet' : 'users'} color={isPersonal ? colors.primary : '#7C3AED'} bg={isPersonal ? colors.primarySoft : colors.violetSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 18, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 12, marginTop: 2 }}>
                    {TYPE_LABELS[item.type] ?? item.type} · {item.members?.length ?? 1} участн. · {item.currency}
                  </Text>
                </View>
                {active ? (
                  <View style={{ paddingHorizontal: spacing(1), paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft }}>
                    <Text style={{ color: colors.primary, fontFamily: appFont, fontSize: 12, fontWeight: '600' }}>выбран</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
                <View style={{ flex: 1 }}>
                  <Button title="Выбрать" variant={active ? 'ghost' : 'primary'} onPress={() => select(item.id)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Пригласить" variant="ghost" onPress={() => invite(item.id)} />
                </View>
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
