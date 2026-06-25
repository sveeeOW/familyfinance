import React from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { usePortfolios } from '../store/portfolio';
import { colors, radius, spacing } from '../theme';

const TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Профиль',
  FAMILY: 'Семейный',
  SHARED: 'Совместный',
  INVESTMENT: 'Инвестиционный',
  GOAL: 'Целевой',
  OTHER: 'Другой',
};

function isSharedLike(portfolio: any) {
  return portfolio.type !== 'PERSONAL' || (portfolio.members?.length ?? 0) > 1;
}

export function PortfolioPicker() {
  const { portfolios, selectedId, select } = usePortfolios();
  const visible = portfolios.filter(isSharedLike);
  if (visible.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1) }}
    >
      {visible.map((p) => {
        const active = p.id === selectedId;
        return (
          <Pressable
            key={p.id}
            onPress={() => select(p.id)}
            style={{
              backgroundColor: active ? colors.primary : colors.cardAlt,
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
              borderRadius: radius.lg,
            }}
          >
            <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600' }}>{p.name}</Text>
            <Text style={{ color: active ? '#E0E7FF' : colors.textMuted, fontSize: 11 }}>
              {TYPE_LABELS[p.type] ?? p.type}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export { TYPE_LABELS };