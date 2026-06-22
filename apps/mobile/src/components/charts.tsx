import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { colors, spacing } from '../theme';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Круговая (кольцевая) диаграмма расходов по категориям (§26.2). */
export function DonutChart({ data, size = 180, thickness = 26 }: { data: Slice[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total <= 0) {
    return <Text style={{ color: colors.textMuted }}>Нет данных для диаграммы.</Text>;
  }

  let offset = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const fraction = d.value / total;
      const dash = fraction * circumference;
      const seg = (
        <Circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          stroke={d.color}
          strokeWidth={thickness}
          fill="transparent"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          strokeLinecap="butt"
        />
      );
      offset += dash;
      return seg;
    });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {segments}
        </G>
        <SvgText x={center} y={center - 4} fontSize={13} fill={colors.textMuted} textAnchor="middle">
          Всего
        </SvgText>
        <SvgText x={center} y={center + 16} fontSize={16} fontWeight="bold" fill={colors.text} textAnchor="middle">
          {fmtShort(total)}
        </SvgText>
      </Svg>
      <View style={{ flex: 1, paddingLeft: spacing(2) }}>
        {data.slice(0, 6).map((d) => (
          <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 8 }} />
            <Text style={{ color: colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{Math.round((d.value / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
}

/** Линейный график доход/расход по месяцам (§23.2). */
export function LineChart({ data, width = 320, height = 160 }: { data: MonthPoint[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <Text style={{ color: colors.textMuted }}>Недостаточно данных для графика.</Text>;
  }
  const pad = 24;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const toPoints = (sel: (d: MonthPoint) => number) =>
    data.map((d, i) => `${x(i)},${y(sel(d))}`).join(' ');

  return (
    <View>
      <Svg width={width} height={height}>
        {/* базовая линия */}
        <Line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={colors.border} strokeWidth={1} />
        <Polyline points={toPoints((d) => d.income)} fill="none" stroke={colors.income} strokeWidth={2.5} />
        <Polyline points={toPoints((d) => d.expense)} fill="none" stroke={colors.expense} strokeWidth={2.5} />
        {data.map((d, i) => (
          <SvgText key={d.month} x={x(i)} y={height - 6} fontSize={9} fill={colors.textMuted} textAnchor="middle">
            {d.month.slice(5)}
          </SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: 4 }}>
        <Legend color={colors.income} label="Доход" />
        <Legend color={colors.expense} label="Расход" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${Math.round(n / 1000)}К`;
  return String(Math.round(n));
}
