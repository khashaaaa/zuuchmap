import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';

export interface ListingHealthRingProps {
  /** 0-100. */
  percent: number;
  size?: number;
  /** Under the ring; omit under 48 px or when the caller labels it elsewhere. */
  label?: string;
}

export function ListingHealthRing({ percent, size = 72, label }: ListingHealthRingProps) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const stroke = Math.max(3, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const text = label ?? t('kit.health');
  return (
    <View accessible accessibilityLabel={`${text}: ${p}%`} style={{ alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.borderDefault} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={colors.statusSuccess} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${c * (p / 100)} ${c}`} rotation={-90} origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {size >= 48 ? <Text style={[type.labelStrong, { position: 'absolute', color: colors.textPrimary }]}>{`${p}%`}</Text> : null}
      </View>
      {label !== '' && size >= 48 ? <Text style={[type.small, { color: colors.textSecondary }]}>{text}</Text> : null}
    </View>
  );
}
