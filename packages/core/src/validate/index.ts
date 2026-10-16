export const validateEmail = (email: unknown): boolean => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/** Digits-only length check (default 8–15, as both current clients). */
export const validatePhone = (phone: unknown, minLength = 8, maxLength = 15): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  const digitsOnly = phone.replace(/[^\d]/g, '');
  return /^\d+$/.test(digitsOnly) && digitsOnly.length >= minLength && digitsOnly.length <= maxLength;
};

/** A Mongolian local number: exactly 8 digits (separators ignored). */
export const validateMongolianPhone = (phone: unknown): boolean => validatePhone(phone, 8, 8);

/** "example.mn" -> "https://example.mn"; empty stays empty. */
export const normalizeWebsiteUrl = (url: string | null | undefined): string => {
  if (!url || url.trim() === '') return '';
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** A listing that browse would show: approved, active, not lapsed. Saved lists use it to grey out the rest. */
export const isListingLive = (
  item: { approval_status?: string | null; status?: string | null; expires_at?: string | null },
  now: number = Date.now(),
): boolean =>
  item.approval_status === 'APPROVED' &&
  item.status !== 'EXPIRED' &&
  (!item.expires_at || new Date(item.expires_at).getTime() > now);
