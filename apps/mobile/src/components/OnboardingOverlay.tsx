import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Pressable, Text, View } from 'react-native';
import { useAuth } from '../store/auth';
import { Button, Card, appFont } from './ui';
import { Icon } from './icons';
import { colors, radius, shadows, spacing } from '../theme';

type Step = {
  title: string;
  body: string;
  icon: React.ComponentProps<typeof Icon>['name'];
};

const VERSION = 'v2';

export function OnboardingOverlay() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const storageKey = useMemo(() => user?.id ? `familyfinance.onboarding.${VERSION}.${user.id}` : null, [user?.id]);

  const steps: Step[] = useMemo(() => [
    {
      title: 'Добро пожаловать в Family Finance',
      body: 'Это приложение для контроля личных и семейных финансов: планируемые и фактические расходы, доходы, аналитика и понимание своего финансового состояния в одном месте.',
      icon: 'wallet',
    },
    {
      title: 'Главная',
      body: 'Здесь видно актуальное положение на сегодня, прогноз на конец месяца, обязательные платежи и расходы по категориям.',
      icon: 'home',
    },
    {
      title: 'Расходы',
      body: 'Добавляйте покупки вручную, проверяйте операции после AI-распознавания и смотрите структуру трат по категориям.',
      icon: 'expense',
    },
    {
      title: 'Доходы',
      body: 'Фиксируйте зарплату, премии, возвраты и регулярные поступления. Можно настроить ежемесячные или кастомные периоды.',
      icon: 'income',
    },
    {
      title: 'Портфели',
      body: 'Разделяйте финансы по сценариям: личный бюджет, семья, совместный портфель, инвестиции или отдельная цель.',
      icon: 'wallet',
    },
    {
      title: 'Кредитки',
      body: 'Ведите покупки по кредитным картам, отслеживайте долг, беспроцентный период и добавляйте покупки по фото или скрину.',
      icon: 'card',
    },
    {
      title: 'Аналитика',
      body: 'Смотрите динамику доходов и расходов, категории, личные/общие расходы и распределение по участникам.',
      icon: 'analytics',
    },
    {
      title: 'Импорт и Telegram',
      body: 'Загружайте чеки, скриншоты банка или PDF-выписки. Telegram-бот тоже умеет распознавать операции и отправлять их в портфель или кредитки.',
      icon: 'camera',
    },
  ], []);

  useEffect(() => {
    if (status !== 'authenticated' || !storageKey) return;
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && !value) {
          setStep(0);
          setVisible(true);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [status, storageKey]);

  const close = async () => {
    if (storageKey) await AsyncStorage.setItem(storageKey, 'done');
    setVisible(false);
  };

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', padding: spacing(2.5), justifyContent: 'center' }}>
        <Card style={{ borderRadius: radius.xl, padding: spacing(2.5), ...shadows.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1.5) }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.yellowSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={current.icon} size={28} color={colors.primary} strokeWidth={2.25} />
            </View>
            <Pressable onPress={close} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontFamily: appFont, fontWeight: '700' }}>Пропустить</Text>
            </Pressable>
          </View>

          <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 25, fontWeight: '800', letterSpacing: -0.7 }}>
            {current.title}
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: appFont, fontSize: 15, lineHeight: 22, marginTop: spacing(1) }}>
            {current.body}
          </Text>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing(2) }}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: radius.pill,
                  backgroundColor: i <= step ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(2) }}>
            {step > 0 ? (
              <View style={{ flex: 1 }}>
                <Button title="Назад" variant="ghost" onPress={() => setStep((currentStep) => Math.max(0, currentStep - 1))} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button title={last ? 'Начать' : 'Далее'} onPress={() => last ? close() : setStep((currentStep) => Math.min(steps.length - 1, currentStep + 1))} />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
