import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api/endpoints';
import { useAuth } from '../store/auth';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [linkInfo, setLinkInfo] = useState<{ code: string; deepLink: string } | null>(null);

  const connectTelegram = async () => {
    try {
      const info = await api.telegramLinkCode();
      setLinkInfo(info);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message ?? 'Не удалось получить код');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2.5) }}>
      <ScreenTitle>Настройки</ScreenTitle>

      <Card>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{user?.name}</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2 }}>{user?.email ?? user?.phone}</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 12 }}>
          Валюта по умолчанию: {user?.defaultCurrency}
        </Text>
      </Card>

      <Card style={{ marginTop: spacing(1.5) }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: spacing(1) }}>Telegram-бот</Text>
        {user?.telegramId ? (
          <Text style={{ color: colors.income }}>✅ Аккаунт привязан</Text>
        ) : linkInfo ? (
          <View>
            <Text style={{ color: colors.textMuted }}>Код: {linkInfo.code}</Text>
            <View style={{ height: spacing(1) }} />
            <Button title="Открыть бота в Telegram" onPress={() => Linking.openURL(linkInfo.deepLink)} />
          </View>
        ) : (
          <Button title="Подключить Telegram-бота" onPress={connectTelegram} />
        )}
      </Card>

      <Card style={{ marginTop: spacing(1.5), padding: 0 }}>
        <MenuItem label="Кредиты" emoji="💳" onPress={() => navigation.navigate('Credits')} />
        <MenuItem label="Инвестиции" emoji="📈" onPress={() => navigation.navigate('Investments')} />
        <MenuItem label="Категории" emoji="🏷" onPress={() => navigation.navigate('Categories')} />
        <MenuItem label="Участники" emoji="👥" onPress={() => navigation.navigate('Participants')} />
        <MenuItem label="Требует уточнения" emoji="❓" onPress={() => navigation.navigate('Clarification')} last />
      </Card>

      <View style={{ marginTop: spacing(3) }}>
        <Button title="Выйти из аккаунта" variant="ghost" onPress={logout} />
      </View>
    </ScrollView>
  );
}

function MenuItem({ label, emoji, onPress, last }: { label: string; emoji: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(2),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 16 }}>
        {emoji}  {label}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}
