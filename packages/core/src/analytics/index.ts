export const ANALYTICS_EVENTS = {
  SEARCH_PERFORMED: 'search_performed',
  SEARCH_WITH_DATES: 'search_with_dates',
  LISTING_OPENED: 'listing_opened',
  CONTACT_CALL: 'contact_call',
  CONTACT_MESSAGE: 'contact_message',
  CONTACT_BOOKING: 'contact_booking',
  VERIFY_STARTED: 'verify_started',
  VERIFY_COMPLETED: 'verify_completed',
  WIZARD_STARTED: 'wizard_started',
  WIZARD_SUBMITTED: 'wizard_submitted',
  LISTING_REJECTED: 'listing_rejected',
  LISTING_FIXED: 'listing_fixed',
} as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
