export const Province = {
  ULAANBAATAR: 'ULAANBAATAR', ARKHANGAI: 'ARKHANGAI', BAYANOLGII: 'BAYANOLGII',
  BAYANKHONGOR: 'BAYANKHONGOR', BULGAN: 'BULGAN', DARKHANUUL: 'DARKHANUUL',
  DORNOD: 'DORNOD', DORNOGOVI: 'DORNOGOVI', DUNDGOVI: 'DUNDGOVI',
  GOVIALTAI: 'GOVIALTAI', GOVISUMBER: 'GOVISUMBER', KHENTII: 'KHENTII',
  KHOVD: 'KHOVD', KHUVSGUL: 'KHUVSGUL', UMNUGOVI: 'UMNUGOVI', ORKHON: 'ORKHON',
  UVURKHANGAI: 'UVURKHANGAI', SELENGE: 'SELENGE', SUKHBAATAR: 'SUKHBAATAR',
  TUV: 'TUV', UVS: 'UVS', ZAVKHAN: 'ZAVKHAN',
} as const;
export type Province = (typeof Province)[keyof typeof Province];
export const PROVINCE_CODES = Object.values(Province) as Province[];

/** Districts of Ulaanbaatar; meaningful only when province is ULAANBAATAR. */
export const District = {
  BAGANUUR: 'BAGANUUR', BAGAKHANGAI: 'BAGAKHANGAI', BAYANGOL: 'BAYANGOL',
  BAYANZURKH: 'BAYANZURKH', CHINGELTEI: 'CHINGELTEI', KHANUUL: 'KHANUUL',
  NALAIKH: 'NALAIKH', SONGINOKHAIRKHAN: 'SONGINOKHAIRKHAN', SUKHBAATAR: 'SUKHBAATAR',
} as const;
export type District = (typeof District)[keyof typeof District];
export const DISTRICT_CODES = Object.values(District) as District[];

/** Aimag centres, and Ulaanbaatar by district centre: `[lat, lng]`. */
export const DISTRICT_CENTERS: Record<District, [number, number]> = {
  BAYANGOL: [47.91, 106.88], BAYANZURKH: [47.92, 106.98], CHINGELTEI: [47.93, 106.91], KHANUUL: [47.88, 106.9],
  SONGINOKHAIRKHAN: [47.91, 106.78], SUKHBAATAR: [47.93, 106.92], NALAIKH: [47.75, 107.26], BAGANUUR: [47.79, 108.36], BAGAKHANGAI: [47.33, 107.48],
};
export const PROVINCE_CENTERS: Record<Exclude<Province, 'ULAANBAATAR'>, [number, number]> = {
  ARKHANGAI: [47.47, 101.45], BAYANOLGII: [48.97, 89.96], BAYANKHONGOR: [46.19, 100.72], BULGAN: [48.81, 103.53], DARKHANUUL: [49.47, 105.97],
  DORNOD: [48.07, 114.53], DORNOGOVI: [44.89, 110.12], DUNDGOVI: [45.76, 106.26], GOVIALTAI: [46.37, 96.26], GOVISUMBER: [46.36, 108.36],
  KHENTII: [47.32, 110.65], KHOVD: [48.01, 91.64], KHUVSGUL: [49.64, 100.16], UMNUGOVI: [43.57, 104.42], ORKHON: [49.03, 104.08],
  UVURKHANGAI: [46.26, 102.78], SELENGE: [50.24, 106.21], SUKHBAATAR: [46.68, 113.28], TUV: [47.71, 106.95], UVS: [49.98, 92.07], ZAVKHAN: [47.73, 96.84],
};

/**
 * A best guess at the province (and Ulaanbaatar district) of a point: the nearest centre. Only a pre-fill for an
 * empty field; the user confirms it. Longitude is scaled by cos(latitude) so distances are roughly even.
 */
export function nearestPlace(lat: number, lng: number): { province: Province; district: District | null } {
  const k = Math.cos((lat * Math.PI) / 180);
  const d2 = ([a, b]: [number, number]) => (a - lat) ** 2 + ((b - lng) * k) ** 2;
  let best: { province: Province; district: District | null; d: number } = { province: 'ULAANBAATAR', district: null, d: Infinity };
  for (const [code, c] of Object.entries(DISTRICT_CENTERS) as Array<[District, [number, number]]>) {
    const d = d2(c);
    if (d < best.d) best = { province: 'ULAANBAATAR', district: code, d };
  }
  for (const [code, c] of Object.entries(PROVINCE_CENTERS) as Array<[Exclude<Province, 'ULAANBAATAR'>, [number, number]]>) {
    const d = d2(c);
    if (d < best.d) best = { province: code, district: null, d };
  }
  return { province: best.province, district: best.district };
}

export interface PlaceName { mn: string; en: string }

export const PROVINCE_NAMES: Record<Province, PlaceName> = {
  ULAANBAATAR: { mn: 'Улаанбаатар', en: 'Ulaanbaatar' },
  ARKHANGAI: { mn: 'Архангай', en: 'Arkhangai' },
  BAYANOLGII: { mn: 'Баян-Өлгий', en: 'Bayan-Ölgii' },
  BAYANKHONGOR: { mn: 'Баянхонгор', en: 'Bayankhongor' },
  BULGAN: { mn: 'Булган', en: 'Bulgan' },
  GOVIALTAI: { mn: 'Говь-Алтай', en: 'Govi-Altai' },
  GOVISUMBER: { mn: 'Говьсүмбэр', en: 'Govisümber' },
  DARKHANUUL: { mn: 'Дархан-Уул', en: 'Darkhan-Uul' },
  DORNOGOVI: { mn: 'Дорноговь', en: 'Dornogovi' },
  DORNOD: { mn: 'Дорнод', en: 'Dornod' },
  DUNDGOVI: { mn: 'Дундговь', en: 'Dundgovi' },
  ZAVKHAN: { mn: 'Завхан', en: 'Zavkhan' },
  ORKHON: { mn: 'Орхон', en: 'Orkhon' },
  UVURKHANGAI: { mn: 'Өвөрхангай', en: 'Övörkhangai' },
  UMNUGOVI: { mn: 'Өмнөговь', en: 'Ömnögovi' },
  SUKHBAATAR: { mn: 'Сүхбаатар', en: 'Sükhbaatar' },
  SELENGE: { mn: 'Сэлэнгэ', en: 'Selenge' },
  TUV: { mn: 'Төв', en: 'Töv' },
  UVS: { mn: 'Увс', en: 'Uvs' },
  KHOVD: { mn: 'Ховд', en: 'Khovd' },
  KHUVSGUL: { mn: 'Хөвсгөл', en: 'Khövsgöl' },
  KHENTII: { mn: 'Хэнтий', en: 'Khentii' },
};

export const DISTRICT_NAMES: Record<District, PlaceName> = {
  BAGANUUR: { mn: 'Багануур', en: 'Baganuur' },
  BAGAKHANGAI: { mn: 'Багахангай', en: 'Bagakhangai' },
  BAYANGOL: { mn: 'Баянгол', en: 'Bayangol' },
  BAYANZURKH: { mn: 'Баянзүрх', en: 'Bayanzürkh' },
  NALAIKH: { mn: 'Налайх', en: 'Nalaikh' },
  SONGINOKHAIRKHAN: { mn: 'Сонгинохайрхан', en: 'Songinokhairkhan' },
  SUKHBAATAR: { mn: 'Сүхбаатар', en: 'Sükhbaatar' },
  KHANUUL: { mn: 'Хан-Уул', en: 'Khan-Uul' },
  CHINGELTEI: { mn: 'Чингэлтэй', en: 'Chingeltei' },
};

export const PriceUnit = {
  HOUR: 'HOUR',
  /** Engine-meter hour (мото цаг); distinct from HOUR (clock time). */
  MOTO_HOUR: 'MOTO_HOUR',
  DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH', PROJECT: 'PROJECT', UNIT: 'UNIT',
  PIECE: 'PIECE', SQM: 'SQM', TRIP: 'TRIP',
  /** A whole-amount (sale) price; carries no unit. */
  TOTAL: 'TOTAL',
} as const;
export type PriceUnit = (typeof PriceUnit)[keyof typeof PriceUnit];
export const PRICE_UNITS = Object.values(PriceUnit) as PriceUnit[];

export const REPORT_REASONS = ['SPAM', 'SCAM', 'WRONG_INFO', 'UNAVAILABLE', 'OFFENSIVE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ReportStatus = { OPEN: 'OPEN', RESOLVED: 'RESOLVED', DISMISSED: 'DISMISSED' } as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ReportKind = { POST: 'POST', REVIEW: 'REVIEW' } as const;
export type ReportKind = (typeof ReportKind)[keyof typeof ReportKind];

export const BookingStatus = {
  PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED', EXPIRED: 'EXPIRED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const UserType = { PROVIDER: 'PROVIDER', CUSTOMER: 'CUSTOMER' } as const;
export type UserType = (typeof UserType)[keyof typeof UserType];

/** Post lifecycle status (`post.status`). */
export const Status = { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', RENTED: 'RENTED' } as const;
export type Status = (typeof Status)[keyof typeof Status];

/** Moderation state (`post.approval_status`). */
export const ApprovalStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const Plan = { FREE: 'FREE', PROVIDER: 'PROVIDER' } as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const PaymentKind = { PLAN: 'PLAN', FEATURED: 'FEATURED' } as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

export const PaymentProvider = { QPAY: 'QPAY', MANUAL: 'MANUAL' } as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const PaymentStatus = { PENDING: 'PENDING', PAID: 'PAID', EXPIRED: 'EXPIRED', CANCELLED: 'CANCELLED' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** SCREAMING_SNAKE error codes the engine answers with (`code` on an error response). */
export const ERROR_CODES = [
  'BOOKING_ALREADY_PENDING',
  'BOOKING_CATEGORY_UNSUPPORTED',
  'BOOKING_DATE_PAST',
  'BOOKING_DATE_RANGE',
  'BOOKING_DAYS_BUSY',
  'BOOKING_NOT_CANCELLABLE',
  'BOOKING_NOT_FOUND',
  'BOOKING_NOT_PENDING',
  'BOOKING_NOT_YOURS',
  'BOOKING_OVERLAP',
  'BOOKING_POST_REMOVED',
  'BOOKING_POST_UNAVAILABLE',
  'BOOKING_SELF',
  'CANNOT_LIKE_OWN_POST',
  'CANNOT_MESSAGE_SELF',
  'CANNOT_REPORT_OWN_POST',
  'CANNOT_REPORT_OWN_REVIEW',
  'COMPANY_EXISTS',
  'COMPANY_FORBIDDEN',
  'CONVERSATION_NOT_FOUND',
  'EMPTY_MESSAGE',
  'FEATURED_PRICE_NOT_SET',
  'INVALID_ATTRIBUTES',
  'INVALID_DATE_RANGE',
  'INVALID_FIELD_KEY',
  'INVALID_PHOTO_KEY',
  'INVALID_PLAN',
  'INVALID_PRICE_UNIT',
  'MISSING_REQUIRED_ATTRIBUTES',
  'NOT_A_PARTICIPANT',
  'NOT_POST_OWNER',
  'PAYMENTS_NOT_CONFIGURED',
  'PAYMENT_PROVIDER_ERROR',
  'PAYMENT_PROVIDER_TIMEOUT',
  'PHOTO_NOT_UPLOADED',
  'PHOTO_STORAGE_UNAVAILABLE',
  'PLAN_NOT_PURCHASABLE',
  'PLAN_PRICE_NOT_SET',
  'POST_EXPIRES_TOO_SOON',
  'POST_GONE',
  'POST_HAS_LIVE_BOOKING',
  'POST_HAS_NO_OWNER',
  'POST_NOT_APPROVED',
  'POST_NOT_AVAILABLE',
  'POST_NOT_DRAFT',
  'POST_NOT_FEATURABLE',
  'POST_NOT_FOUND',
  'POST_QUOTA_EXCEEDED',
  'POST_REQUIRED',
  'PROVIDER_ONLY',
  'REPORT_ALREADY_RESOLVED',
  'REPORT_NEEDS_ONE_SUBJECT',
  'REVIEW_NEEDS_BOOKING',
  'REVIEW_NOT_FOUND',
  'REVIEW_NOT_YOURS',
  'REVIEW_SELF',
  'ROLE_ALREADY_SET',
  'SAVED_SEARCH_LIMIT',
  'TOO_MANY_OPEN_REPORTS',
  'TOO_MANY_VERIFICATIONS',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const isErrorCode = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);
