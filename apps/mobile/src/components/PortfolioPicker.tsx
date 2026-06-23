import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { usePortfolios } from '../store/portfolio';
import { colors, radius, spacing } from '../theme';

const TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Личный',
  FAMILY: 'Семейный',
  SHARED: 'Совместный',
  INVESTMENT: 'Инвест',
  GOAL: 'Цель',
  OTHER: 'Другой',
};

export function PortfolioPicker() {
  const { portfolios, selectedId, select } = usePortfolios();
  if (portfolios.length <= 1) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(1), paddingBottom: spacing(1.25) }}
    >
      {portfolios.map((p) => {
        const active = p.id === selectedId;
        return (
          <Pressable
            key={p.id}
            onPress={() => select(p.id)}
            style={{
              backgroundColor: active ? colors.primary : colors.chip,
              paddingHorizontal: spacing(1.8),
              paddingVertical: spacing(1.05),
              borderRadius: radius.xl,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing(0.7),
            }}
          >
            <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: '900', fontSize: 14 }}>{p.name}</Text>
            <Text style={{ color: active ? '#DDEBFF' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
              {TYPE_LABELS[p.type] ?? p.type}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export { TYPE_LABELS };
