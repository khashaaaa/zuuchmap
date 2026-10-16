import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export interface StarPickerProps {
  /** 0 = nothing chosen yet. */
  value: number;
  onChange: (value: number) => void;
}

/** R1: five 44 px stars; the filled ones are the rating. */
export function StarPicker({ value, onChange }: StarPickerProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          accessibilityRole="radio"
          accessibilityLabel={t('deal.review.outOf', { count: i })}
          accessibilityState={{ checked: value === i }}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="star" size={36} color={i <= value ? colors.statusWarning : colors.borderStrong} fill={i <= value ? colors.statusWarning : undefined} />
        </Pressable>
      ))}
    </View>
  );
}
