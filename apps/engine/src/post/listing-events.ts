export const LISTING_EVENTS = Symbol('LISTING_EVENTS');

export type ListingEvent =
  | { type: 'listing.submitted'; post_id: number; user_id: string | null; title: string | null; category: string }
  | { type: 'listing.approved'; post_id: number; user_id: string | null; title: string | null; revision: boolean }
  | { type: 'listing.rejected'; post_id: number; user_id: string | null; title: string | null; revision: boolean; reason: string; field_key: string | null }
  | { type: 'listing.expired'; post_id: number; user_id: string | null; title: string | null }
  | { type: 'listing.expiring'; post_id: number; user_id: string | null; title: string | null; expires_at: string; days_left: number }
  | { type: 'listing.renewed'; post_id: number; user_id: string | null; expires_at: string }
  // Phase 5: each names the account it is for (`user_id`) so phase 7 can fan out per recipient.
  | { type: 'booking.requested' | 'booking.accepted' | 'booking.declined' | 'booking.cancelled' | 'booking.expired'; booking_id: number; post_id: number | null; user_id: string; title: string | null }
  | { type: 'booking.reminder'; booking_id: number; post_id: number | null; user_id: string; title: string | null; start_date: string; start_time: string | null; address: string | null }
  | { type: 'booking.review_prompt'; booking_id: number; user_id: string; provider_id: string; title: string | null }
  | { type: 'message.created'; conversation_id: string; message_id: string; user_id: string; preview: string }
  | { type: 'review.created'; review_id: number; user_id: string; rating: number }
  // To the review's author, the first time the provider replies.
  | { type: 'review.replied'; review_id: number; user_id: string; provider_id: string }
  // Phase 8: a settled payment (push + receipt e-mail); `resend` = the receipt e-mail alone (Figma P8).
  | { type: 'payment.paid'; payment_id: string; user_id: string; resend?: boolean }
  // Phase 9: to each reporter once their subject is taken down; an admin broadcast (recipients resolved when sent).
  | { type: 'report.resolved'; user_id: string; report_kind: 'POST' | 'REVIEW'; title: string | null }
  | { type: 'broadcast'; broadcast_id: string };

/** Outbound port for listing, booking, message and review events. `NotificationService` (phase 7) subscribes here and does the pushing. */
export interface ListingEventPort {
  emit(event: ListingEvent): void;
}

type Handler = (event: ListingEvent) => void;

/** Default in-process bus: synchronous fan-out, a failing subscriber never breaks the emitter. */
export class InMemoryListingEvents implements ListingEventPort {
  private readonly handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: ListingEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch {
        // subscribers are best effort
      }
    }
  }
}
