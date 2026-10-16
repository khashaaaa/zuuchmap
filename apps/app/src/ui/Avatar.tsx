import { Image, Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface AvatarProps {
  size?: 'small' | 'medium' | 'large';
  kind?: 'initials' | 'company';
  name?: string;
  /** A photo fills the frame; initials/company glyph are the fallback. */
  uri?: string | null;
}

const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0] ?? '').join('').toUpperCase();

export function Avatar({ size = 'medium', kind = 'initials', name = '', uri }: AvatarProps) {
  const { colors, type } = useAppTheme();
  const px = { small: 32, medium: 40, large: 56 }[size];
  const glyph = { small: 16, medium: 20, large: 28 }[size];
  const textStyle = { small: type.micro, medium: type.labelStrong, large: type.title }[size];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name || undefined}
      style={{
        width: px, height: px, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        borderRadius: kind === 'company' ? 8 : 9999, backgroundColor: colors.bgSurfaceSunken,
        borderWidth: 1, borderColor: colors.borderSubtle,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : kind === 'company' ? (
        <Icon name="building-2" size={glyph} color={colors.textSecondary} />
      ) : (
        <Text style={[textStyle, { color: colors.textSecondary }]}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}
