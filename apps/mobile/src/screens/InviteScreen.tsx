import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { request } from '../api/client';
import { useAuth } from '../store/auth';
import { usePortfolios } from '../store/portfolio';
import { Button, Card, ScreenTitle } from '../components/ui';
import { colors, spacing } from '../theme';

export default function InviteScreen({ navigation, route }: any) {
  const rawToken = route?.params?.token;
  const token = useMemo(() => {
    const value = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!value || value === 'undefined' || value === 'null') return null;
    return value;
  }, [rawToken]);
  const status = useAuth((state) => state.status);
  const { load, select } = usePortfolios();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!token) {
      navigation.reset({ index: 0, routes: [{ name: status === 'authenticated' ? 'Tabs' : 'Login' }] });
      return;
    }
    if (status === 'authenticated') {
      accept();
    }
  }, [status, token]);

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ success: boolean; portfolioId: string; alreadyMember?: boolean }>(`/invites/${token}/accept`, {
        method: 'POST',
        body: {},
      });
      await load();
      if (result.portfolioId) select(result.portfolioId);
      setMessage(result.alreadyMember ? 'Вы уже участник этого портфеля.' : 'Приглашение принято. Портфель добавлен.');
    } catch (e: any) {
      setError(e.message ?? 'Не удалось принять приглашение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing(2.5) }}>
      <ScreenTitle subtitle="Совместный портфель">Приглашение</ScreenTitle>
      <Card>
        {status !== 'authenticated' ? (
          <>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: spacing(1) }}>
              Чтобы принять приглашение, войдите или зарегистрируйтесь.
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: spacing(2) }}>
              После входа снова откройте эту ссылку или вернитесь на этот экран.
            </Text>
            <View style={{ gap: spacing(1) }}>
              <Button title="Войти" onPress={() => navigation.navigate('Login')} />
              <Button title="Зарегистрироваться" variant="ghost" onPress={() => navigation.navigate('Register')} />
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: error ? colors.expense : colors.text, fontSize: 17, fontWeight: '600', marginBottom: spacing(1) }}>
              {error ?? message ?? 'Принимаю приглашение…'}
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: spacing(2) }}>
              {token ? `Код приглашения: ${String(token).slice(0, 8)}…` : 'Код приглашения не найден.'}
            </Text>
            <View style={{ gap: spacing(1) }}>
              {error ? <Button title="Повторить" onPress={accept} loading={busy} /> : null}
              <Button title="К портфелям" variant="ghost" onPress={() => navigation.navigate('Tabs', { screen: 'Портфели' })} disabled={busy} />
            </View>
          </>
        )}
      </Card>
    </View>
  );
}
