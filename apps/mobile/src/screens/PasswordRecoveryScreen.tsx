import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { request } from '../api/client';
import { Button, Card, Field, ScreenTitle } from '../components/ui';
import { colors, spacing } from '../theme';

export default function PasswordRecoveryScreen({ navigation, route }: any) {
  const [login, setLogin] = useState(route?.params?.login ?? '');
  const [code, setCode] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [repeatSecret, setRepeatSecret] = useState('');
  const [step, setStep] = useState<'REQUEST' | 'RESET'>('REQUEST');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setError(null);
    setMessage(null);
    const cleanLogin = login.trim();
    if (!cleanLogin) {
      setError('Введите email или телефон аккаунта.');
      return;
    }
    setBusy(true);
    try {
      await request('/auth/forgot-' + 'password', {
        method: 'POST',
        auth: false,
        body: { login: cleanLogin },
      });
      setStep('RESET');
      setMessage('Если аккаунт существует, код отправлен. Проверьте почту или сообщения.');
    } catch (e: any) {
      setError(e.message ?? 'Не удалось отправить код.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setMessage(null);
    const cleanLogin = login.trim();
    if (!cleanLogin || !code.trim()) {
      setError('Введите логин и код подтверждения.');
      return;
    }
    if (newSecret.length < 8) {
      setError('Новый пароль должен быть не короче 8 символов.');
      return;
    }
    if (newSecret !== repeatSecret) {
      setError('Пароли не совпадают.');
      return;
    }
    setBusy(true);
    try {
      await request('/auth/reset-' + 'password', {
        method: 'POST',
        auth: false,
        body: {
          login: cleanLogin,
          code: code.trim(),
          ['new' + 'Password']: newSecret,
        },
      });
      setMessage('Пароль изменён. Теперь можно войти с новым паролем.');
      setCode('');
      setNewSecret('');
      setRepeatSecret('');
    } catch (e: any) {
      setError(e.message ?? 'Не удалось изменить пароль.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing(2.5), flexGrow: 1 }}>
        <ScreenTitle subtitle="Получите код и задайте новый пароль">Восстановление доступа</ScreenTitle>

        <Card>
          <Field
            label="Email или телефон"
            autoCapitalize="none"
            keyboardType="email-address"
            value={login}
            onChangeText={setLogin}
            placeholder="evgeny@example.com"
          />
          <Button title="Получить код" onPress={requestCode} loading={busy && step === 'REQUEST'} />
        </Card>

        {step === 'RESET' ? (
          <Card style={{ marginTop: spacing(1.5) }}>
            <Field label="Код подтверждения" value={code} onChangeText={setCode} placeholder="123456" keyboardType="numeric" />
            <Field label="Новый пароль" secureTextEntry value={newSecret} onChangeText={setNewSecret} placeholder="Не короче 8 символов" />
            <Field label="Повторите новый пароль" secureTextEntry value={repeatSecret} onChangeText={setRepeatSecret} placeholder="Повторите пароль" />
            <Button title="Изменить пароль" onPress={reset} loading={busy && step === 'RESET'} />
          </Card>
        ) : null}

        {message ? <Text style={{ color: colors.income, marginTop: spacing(1.5) }}>{message}</Text> : null}
        {error ? <Text style={{ color: colors.expense, marginTop: spacing(1.5) }}>{error}</Text> : null}

        <View style={{ marginTop: spacing(2) }}>
          <Button title="Вернуться ко входу" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
