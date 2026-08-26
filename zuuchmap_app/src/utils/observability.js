import * as Sentry from '@sentry/react-native';

/**
 * Crash and error reporting, env-gated on `SENTRY_DSN`.
 *
 * A crash on someone's phone was invisible: the app either showed its error
 * boundary or died, and nothing left the device. Without the DSN every function
 * here is a no-op, so a local dev build reports nothing and needs no account.
 *
 * PII stays off. Phone numbers are the login identifier, so the default of
 * attaching request data would put them in a third-party system.
 */
let enabled = false;

export function initObservability() {
  const dsn = process.env.SENTRY_DSN || process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    // Errors are the point; traces are billed volume on a small app.
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });
  enabled = true;
}

export function captureError(error, context) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('zuuchmap', context);
    scope.setLevel('error');
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}
