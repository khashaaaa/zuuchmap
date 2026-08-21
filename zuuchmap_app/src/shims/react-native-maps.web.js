// Web shim for react-native-maps (native-only). Metro aliases the package
// here on web via metro.config.js so map screens render a placeholder
// instead of crashing the bundle.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

export const Marker = () => null;
export const Callout = () => null;
export const Polyline = () => null;
export const Polygon = () => null;
export const Circle = () => null;

const MapView = React.forwardRef(({ style, children }, ref) => {
  const { t } = useTranslation();
  React.useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    animateCamera: () => {},
    fitToCoordinates: () => {},
    getCamera: async () => ({}),
  }));
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.text}>{t('map.webUnsupported')}</Text>
      <View style={{ display: 'none' }}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8e4de',
    minHeight: 120,
  },
  text: { fontSize: 14, color: '#6b5f52', fontWeight: '600' },
});

export default MapView;
