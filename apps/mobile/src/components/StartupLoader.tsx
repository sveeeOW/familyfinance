import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { appFont } from './ui';
import { colors, radius, shadows, spacing } from '../theme';

const SYMBOLS = ['€', '$', '₽'];

export function StartupLoader() {
  const [index, setIndex] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % SYMBOLS.length), 620);
    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(spin, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => {
      clearInterval(timer);
      animation.stop();
    };
  }, [pulse, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <Animated.View
        style={{
          width: 112,
          height: 112,
          borderRadius: radius.pill,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate }, { scale }],
          opacity,
          ...shadows.card,
        }}
      >
        <Text style={{ color: colors.primary, fontFamily: appFont, fontSize: 54, fontWeight: '800', lineHeight: 62 }}>
          {SYMBOLS[index]}
        </Text>
      </Animated.View>
      <Text style={{ color: colors.text, fontFamily: appFont, fontSize: 20, fontWeight: '800', marginTop: spacing(2.25), letterSpacing: -0.4 }}>
        Family Finance
      </Text>
      <Text style={{ color: colors.textMuted, fontFamily: appFont, textAlign: 'center', marginTop: spacing(0.75) }}>
        Загружаю ваши финансы…
      </Text>
    </View>
  );
}
