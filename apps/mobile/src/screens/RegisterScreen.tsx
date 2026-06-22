import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../store/auth';
import { Button, Field, ScreenTitle } from '../components/ui';
import { colors, spacing } from '../theme';

export default function RegisterScreen({ navigation }: any) {
  const { register, error } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setLocalError(null);
    if (password !== confirm) {
      setLocalError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setLocalError('Пароль должен быть не короче 8 символов');
      return;
    }
    setBusy(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
    } catch {
      // из стора
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing(3), flexGrow: 1, justifyContent: 'center' }}>
        <ScreenTitle>Регистрация</ScreenTitle>
        <Field label="Имя" value={name} onChangeText={setName} placeholder="Евгений" />
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="evgeny@example.com"
        />
        <Field label="Пароль" secureTextEntry value={password} onChangeText={setPassword} />
        <Field label="Подтверждение пароля" secureTextEntry value={confirm} onChangeText={setConfirm} />
        {(localError || error) ? (
          <Text style={{ color: colors.expense, marginBottom: spacing(1) }}>{localError ?? error}</Text>
        ) : null}
        <Button title="Создать аккаунт" onPress={submit} loading={busy} />
        <View style={{ height: spacing(1.5) }} />
        <Button title="У меня уже есть аккаунт" variant="ghost" onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
