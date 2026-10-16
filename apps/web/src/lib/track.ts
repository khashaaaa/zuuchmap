import type { AnalyticsEvent } from '@zuuchmap/core';

/** The engine collects analytics in a later phase; until then events only reach the console. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  console.debug('[track]', event, props ?? {});
}
