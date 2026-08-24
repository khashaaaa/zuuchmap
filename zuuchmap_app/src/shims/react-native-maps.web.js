// Web shim for react-native-maps (native-only). Metro aliases the package
// here on web via metro.config.js so map screens render a placeholder
// instead of crashing the bundle.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

export const Marker = () => null;
export const Callout = () => null;
export const Polyline = () => null;
export const Polygon = () => null;
export const Circle = () => null;

const MapView = React.forwardRef(({ style, children }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  React.useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    animateCamera: () => {},
    fitToCoordinates: () => {},
    getCamera: async () => ({}),
  }));
  return (
    <View style={[styles.placeholder, { backgroundColor: colors.surfaceLight }, style]}>
      <Text style={[styles.text, { color: colors.text.secondary }]}>{t('map.webUnsupported')}</Text>
      <View style={{ display: 'none' }}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  text: { ...typography.styles.bodyBold },
});

export default MapView;
