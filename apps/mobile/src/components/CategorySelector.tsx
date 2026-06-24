import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Category } from '../api/types';
import { Field, appFont } from './ui';
import { colors, radius, spacing } from '../theme';

export function CategorySelector({
  categories,
  value,
  onChange,
  onAddPress,
  title = 'Категория',
}: {
  categories: Category[];
  value?: string | null;
  onChange: (categoryId: string | null) => void;
  onAddPress?: () => void;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const active = categories.find((category) => category.id === value) ?? null;

  const top = useMemo(() => {
    const base = categories.slice(0, 5);
    if (active && !base.some((category) => category.id === active.id)) return [active, ...base.slice(0, 4)];
    return base;
  }, [categories, active]);

  const other = useMemo(() => {
    const topIds = new Set(top.map((category) => category.id));
    const q = query.trim().toLowerCase();
    return categories
      .filter((category) => !topIds.has(category.id))
      .filter((category) => !q || category.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [categories, top, query]);

  return (
    <View style={{ marginBottom: spacing(2) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: colors.textMuted, fontFamily: appFont, fontWeight: '600', fontSize: 13 }}>{title}</Text>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          {onAddPress ? (
            <Pressable onPress={onAddPress}>
              <Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '600', fontSize: 13 }}>+ Добавить</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setExpanded((v) => !v)}>
            <Text style={{ color: colors.primary, fontFamily: appFont, fontWeight: '600', fontSize: 13 }}>
              {expanded ? 'Скрыть' : 'Все категории'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
        {top.map((category) => (
          <CategoryChip key={category.id} category={category} active={value === category.id} onPress={() => onChange(category.id)} />
        ))}
      </View>

      {expanded ? (
        <View style={{ marginTop: spacing(1.25), padding: spacing(1.25), borderRadius: radius.lg, backgroundColor: colors.cardAlt }}>
          <Field value={query} onChangeText={setQuery} placeholder="Найти категорию" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {other.map((category) => (
              <CategoryChip key={category.id} category={category} active={value === category.id} onPress={() => onChange(category.id)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CategoryChip({ category, active, onPress }: { category: Category; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing(1.4),
        paddingVertical: spacing(0.85),
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: active ? (category.color ?? colors.primary) : colors.border,
        backgroundColor: active ? colors.primarySoft : colors.card,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.text, fontFamily: appFont, fontSize: 13, fontWeight: '600' }}>
        {category.name}
      </Text>
    </Pressable>
  );
}
