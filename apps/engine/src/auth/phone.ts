/** Mongolian numbers are 8 digits; "+976" / "976" prefixes and separators are accepted. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('976')) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? digits : null;
}
