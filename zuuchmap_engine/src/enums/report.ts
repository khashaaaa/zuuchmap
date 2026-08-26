/**
 * Why something was flagged.
 *
 * A closed list, not free text: the admin queue is triaged by kind, and the
 * labels are translated client-side (`report.reason.<KEY>`) so a reporter
 * writing in Mongolian never has to be read by someone filtering in English.
 */
export const REPORT_REASONS = [
  'SPAM', // duplicate or advertising junk
  'SCAM', // asks for money up front, fake contact
  'WRONG_INFO', // price, location or availability is not real
  'UNAVAILABLE', // the item or job no longer exists
  'OFFENSIVE', // abusive text or imagery
  'OTHER',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export enum ReportStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}
