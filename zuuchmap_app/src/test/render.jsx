import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../context/AppContext';
import '../i18n';

/**
 * Render with the providers every screen in this app assumes.
 *
 * `useAppTheme` reads the theme out of AppContext, so a screen rendered without
 * AppProvider throws before it draws anything — which is why nothing could be
 * component-tested until this existed.
 *
 * Retries off: a screen whose query fails should reach its error state now, not
 * after three backoffs the test has to wait through.
 */
export async function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // A fixed frame — jsdom has no window metrics, and SafeAreaProvider otherwise
  // never resolves its insets, leaving every child unrendered.
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };

  // RNTL v14's `render` is async — it flushes effects before resolving. Awaited
  // here so callers get a settled tree (and a populated `screen`) rather than a
  // promise whose queries do not exist yet.
  return Object.assign(
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AppProvider>
          <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
        </AppProvider>
      </SafeAreaProvider>
    ),
    { queryClient }
  );
}

export const navigationStub = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
});
