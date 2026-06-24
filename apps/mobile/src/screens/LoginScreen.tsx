import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../store/auth';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, spacing } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const { login, error } = useAuth();
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await login(value.trim(), password);
    } catch {
      // ошибка показывается из стора
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing(3), justifyContent: 'center', flexGrow: 1 }}>
        <Text style={{ color: colors.primary, fontSize: 32, fontWeight: '900', marginBottom: 4 }}>
          Family Finance
        </Text>
        <Text style={{ color: colors.textMuted, marginBottom: spacing(3) }}>
          Семейный финансовый портфель
        </Text>

        <ScreenTitle>Вход</ScreenTitle>
        <Field
          label="Email или телефон"
          autoCapitalize="none"
          keyboardType="email-address"
          value={value}
          onChangeText={setValue}
          placeholder="evgeny@example.com"
        />
        <Field
          label="Пароль"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        {error ? <Text style={{ color: colors.expense, marginBottom: spacing(1) }}>{error}</Text> : null}
        <Button title="Войти" onPress={submit} loading={busy} />
        <View style={{ height: spacing(1) }} />
        <Button title="Забыли пароль?" variant="ghost" onPress={() => navigation.navigate('PasswordRecovery', { login: value.trim() })} />
        <View style={{ height: spacing(1.5) }} />
        <Button title="Создать аккаунт" variant="ghost" onPress={() => navigation.navigate('Register')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
