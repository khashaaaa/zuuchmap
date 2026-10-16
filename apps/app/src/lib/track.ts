import type { AnalyticsEvent } from '@zuuchmap/core';
import { api } from './api';

/** Analytics seam: the engine collects in a later phase, so for now events only reach the debug log. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (__DEV__) console.debug('[track]', event, props ?? {});
}

/** A customer tapped Call: counted as a contact on the listing, fire-and-forget, before the dialer opens. */
export function recordCall(postId: number): void {
  api(`/posts/${postId}/contact`, { method: 'POST', body: { kind: 'CALL' }, visitor: true }).catch(() => undefined);
}
