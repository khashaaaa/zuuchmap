import { View } from 'react-native';
import { useAppTheme } from '../design/theme';

export function SheetGrabber() {
  const { colors } = useAppTheme();
  return <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong }} />;
}
