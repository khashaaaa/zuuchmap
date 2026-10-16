import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';

export interface WizardStepsProps {
  /** Step names in order; the bar count follows. */
  steps: string[];
  /** 1-based current step. */
  current: number;
}

export function WizardSteps({ steps, current }: WizardStepsProps) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const counter = t('kit.wizard.step', { current, total: steps.length });
  const name = steps[current - 1] ?? '';
  return (
    <View accessible accessibilityLabel={`${counter}: ${name}`} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[type.overline, { color: colors.textSecondary }]}>{counter}</Text>
        <Text style={[type.labelStrong, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < current ? colors.actionSecondary : colors.borderDefault }} />
        ))}
      </View>
    </View>
  );
}
