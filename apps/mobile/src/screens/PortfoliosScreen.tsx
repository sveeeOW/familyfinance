import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Share, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/endpoints';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { TYPE_LABELS } from '../components/PortfolioPicker';
import { colors, spacing } from '../theme';

export default function PortfoliosScreen() {
  const { portfolios, load, select } = usePortfolios();

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async (portfolioId: string) => {
    try {
      const { url } = await api.createInvite(portfolioId);
      await Share.share({ message: `Приглашаю в портфель Family Finance: ${url}` });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось создать приглашение');
    }
  };

  const create = () => {
    Alert.prompt?.('Новый портфель', 'Название', async (name) => {
      if (!name) return;
      try {
        await api.createPortfolio({ name, type: 'SHARED' });
        await load();
      } catch (e: any) {
        Alert.alert('Ошибка', e.message ?? 'Не удалось создать');
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <ScreenTitle>Портфели</ScreenTitle>
      <FlatList
        data={portfolios}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={{ height: spacing(1.5) }} />}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {TYPE_LABELS[item.type] ?? item.type} · {item.members?.length ?? 1} участн. · {item.currency}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.5) }}>
              <View style={{ flex: 1 }}>
                <Button title="Выбрать" variant="ghost" onPress={() => select(item.id)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Пригласить" onPress={() => invite(item.id)} />
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={
          <View style={{ marginTop: spacing(2) }}>
            <Button title="Создать портфель" variant="ghost" onPress={create} />
          </View>
        }
      />
    </View>
  );
}
