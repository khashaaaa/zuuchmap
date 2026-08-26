/**
 * The timezone every scheduled job is expressed in.
 *
 * No `@Cron` carried one and nothing sets `TZ`, so the schedules ran in whatever
 * the host happened to be — on a UTC VPS the "01:00" review prompt fired at
 * 09:00 in Ulaanbaatar, the nightly post expiry at 08:00, and the stale-booking
 * sweep at 08:15. The times still read as small hours in the source while
 * landing in the middle of the working day.
 *
 * Every user of this product is in Mongolia, so the schedules mean Mongolian
 * local time. Pinning it here rather than relying on the host's `TZ` also keeps
 * a developer's machine and the server on the same schedule.
 */
export const APP_TIMEZONE = 'Asia/Ulaanbaatar';
