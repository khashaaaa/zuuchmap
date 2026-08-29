import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Error reporting, env-gated.
 *
 * Without `SENTRY_DSN` every function here is a no-op and the SDK is never
 * initialised — localhost dev stays quiet and no build-time decision is
 * involved. With it, unhandled 5xx, uncaught exceptions and rejected promises
 * leave the VPS instead of dying in a pm2 log file nobody is tailing.
 *
 * Init must run before `NestFactory.create` so the SDK's instrumentation is in
 * place before any handler is registered.
 */
const logger = new Logger('Observability');

let enabled = false;

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.log('SENTRY_DSN unset — error reporting disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    // Traces are a paid volume on every plan and this is a small API — errors
    // are the reason we are here. Opt in per-deploy if a latency question comes up.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // The engine handles phone numbers and JWTs. `sendDefaultPii: false` is the
    // SDK default; this is explicit so a future upgrade cannot flip it silently.
    sendDefaultPii: false,
    beforeSend(event) {
      // Belt and braces: strip anything that could carry a token or a phone
      // number even if a future integration starts attaching request data.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  enabled = true;
  logger.log(`Error reporting enabled [${process.env.NODE_ENV}]`);
}

/**
 * Report a server-side failure. `context` is small, non-PII metadata — a route,
 * a status, an entity id — never a request body.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('zuuchmap', context);
    scope.setLevel('error');
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
    );
  });
}

/**
 * Give the SDK a moment to drain before the process exits. Called on the
 * fatal paths only — an unflushed queue on `process.exit` loses exactly the
 * error you most wanted to see.
 */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Nothing useful to do if the reporter itself fails while we are dying.
  }
}
