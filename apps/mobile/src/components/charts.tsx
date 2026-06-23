import React from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Stop, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Современная кольцевая диаграмма расходов по категориям. */
export function DonutChart({ data, size = 196, thickness = 30 }: { data: Slice[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radiusValue = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const center = size / 2;
  const visible = data.filter((d) => d.value > 0).slice(0, 7);

  if (total <= 0) {
    return <EmptyChart text="Нет данных для диаграммы." />;
  }

  let offset = 0;
  const segments = visible.map((d, i) => {
    const fraction = d.value / total;
    const dash = Math.max(2, fraction * circumference - 2);
    const gap = Math.max(0, circumference - dash);
    const seg = (
      <Circle
        key={`${d.label}-${i}`}
        cx={center}
        cy={center}
        r={radiusValue}
        stroke={d.color}
        strokeWidth={thickness}
        fill="transparent"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
      />
    );
    offset += fraction * circumference;
    return seg;
  });

  const top = [...visible].sort((a, b) => b.value - a.value)[0];

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={radiusValue} stroke={colors.cardAlt} strokeWidth={thickness} fill="transparent" />
          <G rotation={-90} origin={`${center}, ${center}`}>
            {segments}
          </G>
          <SvgText x={center} y={center - 8} fontSize={12} fontWeight="700" fill={colors.textMuted} textAnchor="middle">
            Всего
          </SvgText>
          <SvgText x={center} y={center + 17} fontSize={24} fontWeight="900" fill={colors.text} textAnchor="middle">
            {fmtShort(total)}
          </SvgText>
        </Svg>
        <View style={{ flex: 1, paddingLeft: spacing(1.5) }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800' }}>Главная статья</Text>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 4 }} numberOfLines={2}>
            {top?.label ?? '—'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 5, fontWeight: '700' }}>
            {top ? `${Math.round((top.value / total) * 100)}% от расходов` : 'Нет данных'}
          </Text>
        </View>
      </View>

      <View style={{ width: '100%', marginTop: spacing(1.5), gap: spacing(0.9) }}>
        {visible.slice(0, 5).map((d) => {
          const percent = Math.round((d.value / total) * 100);
          return (
            <View key={d.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 8 }} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                  {d.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '900' }}>{percent}%</Text>
              </View>
              <View style={{ height: 7, borderRadius: radius.pill, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(4, percent)}%`, height: 7, borderRadius: radius.pill, backgroundColor: d.color }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
}

/** Линейный график доход/расход по месяцам — без ощущения Excel. */
export function LineChart({ data, height = 210 }: { data: MonthPoint[]; height?: number }) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(680, Math.max(300, windowWidth - spacing(7.5)));

  if (data.length < 2) {
    return <EmptyChart text="Недостаточно данных для графика." />;
  }

  const padX = 22;
  const padTop = 20;
  const padBottom = 34;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const stepX = (width - padX * 2) / (data.length - 1);
  const y = (v: number) => height - padBottom - (v / max) * (height - padTop - padBottom);
  const x = (i: number) => padX + i * stepX;

  const toPoints = (sel: (d: MonthPoint) => number) => data.map((d, i) => `${x(i)},${y(sel(d))}`).join(' ');
  const expenseArea = `${padX},${height - padBottom} ${toPoints((d) => d.expense)} ${width - padX},${height - padBottom}`;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
        <Legend color={colors.income} label="Доход" />
        <Legend color={colors.expense} label="Расход" />
      </View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.expense} stopOpacity="0.2" />
            <Stop offset="1" stopColor={colors.expense} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((line) => {
          const yy = padTop + (height - padTop - padBottom) * line;
          return <Line key={line} x1={padX} y1={yy} x2={width - padX} y2={yy} stroke={colors.border} strokeWidth={1} strokeDasharray="5 8" />;
        })}
        <Path d={`M ${expenseArea} Z`} fill="url(#expenseFill)" />
        <Polyline points={toPoints((d) => d.income)} fill="none" stroke={colors.income} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points={toPoints((d) => d.expense)} fill="none" stroke={colors.expense} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <React.Fragment key={d.month}>
            <Circle cx={x(i)} cy={y(d.income)} r={4} fill={colors.card} stroke={colors.income} strokeWidth={3} />
            <Circle cx={x(i)} cy={y(d.expense)} r={4} fill={colors.card} stroke={colors.expense} strokeWidth={3} />
            <SvgText x={x(i)} y={height - 10} fontSize={10} fontWeight="700" fill={colors.textMuted} textAnchor="middle">
              {d.month.slice(5)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

export function BalanceBars({ personal = 0, shared = 0 }: { personal?: number; shared?: number }) {
  const total = Math.max(1, personal + shared);
  const personalPercent = Math.round((personal / total) * 100);
  const sharedPercent = 100 - personalPercent;

  return (
    <View>
      <View style={{ flexDirection: 'row', height: 18, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.cardAlt }}>
        <View style={{ flex: personalPercent, backgroundColor: colors.primary }} />
        <View style={{ flex: sharedPercent, backgroundColor: colors.primaryAlt }} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.2) }}>
        <View style={{ flex: 1 }}>
          <Legend color={colors.primary} label={`Личные · ${personalPercent}%`} />
          <Text style={{ color: colors.text, fontWeight: '900', marginTop: 4 }}>{fmt(personal)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Legend color={colors.primaryAlt} label={`Общие · ${sharedPercent}%`} />
          <Text style={{ color: colors.text, fontWeight: '900', marginTop: 4 }}>{fmt(shared)}</Text>
        </View>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, marginRight: 7 }} />
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <View style={{ minHeight: 140, borderRadius: radius.xl, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', padding: spacing(2) }}>
      <Text style={{ color: colors.textMuted, fontWeight: '800', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${Math.round(n / 1000)}К`;
  return String(Math.round(n));
}

function fmt(n?: number) {
  return new Intl.NumberFormat('ru-RU').format(n ?? 0) + ' ₽';
}
