import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

type IconName =
  | 'home'
  | 'expense'
  | 'income'
  | 'wallet'
  | 'analytics'
  | 'settings'
  | 'plus'
  | 'camera'
  | 'card'
  | 'spark'
  | 'users'
  | 'receipt'
  | 'pie'
  | 'trend';

export function Icon({ name, size = 24, color = '#1F2937', strokeWidth = 2.2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        <>
          <Path d="M4 10.5 12 4l8 6.5" {...common} />
          <Path d="M6.5 9.5V20h11V9.5" {...common} />
          <Path d="M10 20v-5h4v5" {...common} />
        </>
      ) : null}

      {name === 'expense' ? (
        <>
          <Rect x="4" y="5" width="16" height="14" rx="4" {...common} />
          <Path d="M8 10h8" {...common} />
          <Path d="M12 9v6" {...common} />
          <Path d="m9.5 12.5 2.5 2.5 2.5-2.5" {...common} />
        </>
      ) : null}

      {name === 'income' ? (
        <>
          <Rect x="4" y="5" width="16" height="14" rx="4" {...common} />
          <Path d="M8 14h8" {...common} />
          <Path d="M12 15V9" {...common} />
          <Path d="m9.5 11.5 2.5-2.5 2.5 2.5" {...common} />
        </>
      ) : null}

      {name === 'wallet' ? (
        <>
          <Path d="M5 7.5h13a2 2 0 0 1 2 2v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9A2.5 2.5 0 0 1 6.5 5H17" {...common} />
          <Path d="M16 12h4v3h-4a1.5 1.5 0 0 1 0-3Z" {...common} />
          <Circle cx="16.2" cy="13.5" r="0.35" fill={color} />
        </>
      ) : null}

      {name === 'analytics' ? (
        <>
          <Path d="M5 19V5" {...common} />
          <Path d="M5 19h14" {...common} />
          <Path d="M8 15.5 11 12l2.5 2.2L18.5 8" {...common} />
          <Circle cx="8" cy="15.5" r="1" fill={color} />
          <Circle cx="11" cy="12" r="1" fill={color} />
          <Circle cx="13.5" cy="14.2" r="1" fill={color} />
          <Circle cx="18.5" cy="8" r="1" fill={color} />
        </>
      ) : null}

      {name === 'settings' ? (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path d="M12 3.8v2.1M12 18.1v2.1M4.9 6.1l1.5 1.5M17.6 16.4l1.5 1.5M3.8 12h2.1M18.1 12h2.1M4.9 17.9l1.5-1.5M17.6 7.6l1.5-1.5" {...common} />
        </>
      ) : null}

      {name === 'plus' ? (
        <>
          <Circle cx="12" cy="12" r="8" {...common} />
          <Path d="M12 8v8M8 12h8" {...common} />
        </>
      ) : null}

      {name === 'camera' ? (
        <>
          <Path d="M7.5 7.5 9 5.5h6l1.5 2H19a2 2 0 0 1 2 2v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-7a2 2 0 0 1 2-2h2.5Z" {...common} />
          <Circle cx="12" cy="13" r="3.2" {...common} />
        </>
      ) : null}

      {name === 'card' ? (
        <>
          <Rect x="3.5" y="6" width="17" height="12" rx="3" {...common} />
          <Path d="M3.5 10h17" {...common} />
          <Path d="M7 15h4" {...common} />
        </>
      ) : null}

      {name === 'spark' ? (
        <>
          <Path d="M12 3.5 13.8 9l5.7 1.5-5.7 1.7L12 20.5l-1.8-8.3-5.7-1.7L10.2 9 12 3.5Z" {...common} />
        </>
      ) : null}

      {name === 'users' ? (
        <>
          <Circle cx="9" cy="9" r="3" {...common} />
          <Path d="M4 19a5 5 0 0 1 10 0" {...common} />
          <Path d="M15.5 10a2.5 2.5 0 1 0 0-5" {...common} />
          <Path d="M16 15.2a4.5 4.5 0 0 1 4 3.8" {...common} />
        </>
      ) : null}

      {name === 'receipt' ? (
        <>
          <Path d="M6 4h12v16l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 20V4Z" {...common} />
          <Path d="M9 8h6M9 12h6M9 16h4" {...common} />
        </>
      ) : null}

      {name === 'pie' ? (
        <>
          <Path d="M12 4a8 8 0 1 0 8 8h-8V4Z" {...common} />
          <Path d="M14 4.3V10h5.7A7.3 7.3 0 0 0 14 4.3Z" {...common} />
        </>
      ) : null}

      {name === 'trend' ? (
        <>
          <Path d="M4 17 9 12l3.2 3.2L20 7" {...common} />
          <Path d="M15 7h5v5" {...common} />
        </>
      ) : null}
    </Svg>
  );
}
