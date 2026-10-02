import React, { Component, Fragment } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, radius, palettes, interactions } from '../design/theme';
import i18n from '../i18n';
import { queryClient } from '../services/queryClient';
import { reportError } from '../services/analytics';
import { captureError } from '../utils/observability';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const where = info?.componentStack?.trim().split('\n')[0]?.trim() ?? 'unknown';
    reportError(error, `boundary:${where}`);
    // A render error caught here never reaches Sentry's global handler.
    captureError(error, { boundary: where });
  }

  handleRetry = () => {
    // Reset the queries first, then remount the subtree via `resetKey`. Clearing
    // the error alone would re-render the exact tree that just threw, so retry
    // would loop straight back into this screen.
    queryClient.resetQueries();
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }

    // A class component cannot use the theme hook, so the parent passes the
    // resolved mode down. The OS scheme was read here before, and a dark app on
    // a light phone crashed onto a light screen.
    const colors = palettes[this.props.isDark === false ? 'light' : 'dark'];

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{i18n.t('common.error')}</Text>
        {/* A production error message is a minified React stack — useless to the
            user and alarming. The real one goes to reportError instead. */}
        <Text style={[styles.message, { color: colors.text.secondary }]}>
          {__DEV__ ? this.state.error?.message : i18n.t('errors.unexpected')}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={this.handleRetry}
          activeOpacity={interactions.activeOpacity}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{i18n.t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  title: {
    ...typography.styles.title,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.styles.caption,
    textAlign: 'center',
    marginBottom: spacing.xl,
    opacity: 0.6,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
  },
  buttonText: {
    ...typography.styles.labelStrong,
  },
});
