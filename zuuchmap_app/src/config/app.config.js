export const PRICE_UNITS = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM'];

export const POST_STATUSES = ['ACTIVE', 'EXPIRED', 'RENTED'];

export const DEFAULT_AVATAR_URL = 'https://ui-avatars.com/api/?background=F5A623&color=1A1200&size=150&name=U';

export const APP_CONFIG = {
  APP_NAME: 'Zuuchmap',
  VERSION: '1.0.1',

  USER_TYPES: {
    PROVIDER: 'PROVIDER',
    CUSTOMER: 'CUSTOMER',
  },
  
  DEFAULT_LOCATION: {
    PROVINCE: 'ULAANBAATAR',
    DISTRICT: 'BAYANZURKH',
  },
  
  IMAGE: {
    COMPRESSION_QUALITY: 0.7,
    MAX_WIDTH: 1200,
    MAX_HEIGHT: 1200,
  },
  
  VALIDATION: {
    PHONE_NUMBER_PATTERN: /^\d{8}$/,
    OTP_LENGTH: 6,
  },
  
  TIMEOUTS: {
    VIEW_INCREMENT_DELAY: 2000,
    OTP_RESEND_COOLDOWN: 60,
  },

};

// Location codes — mirror the engine's Province/District enums. Display names
// come from i18n (`province.<CODE>` / `district.<CODE>`), never from here.
export const provinces = [
    'ULAANBAATAR', 'ARKHANGAI', 'BAYANOLGII', 'BAYANKHONGOR', 'BULGAN',
    'DARKHANUUL', 'DORNOD', 'DORNOGOVI', 'DUNDGOVI', 'GOVIALTAI',
    'GOVISUMBER', 'KHENTII', 'KHOVD', 'KHUVSGUL', 'UMNUGOVI',
    'ORKHON', 'UVURKHANGAI', 'SELENGE', 'SUKHBAATAR', 'TUV',
    'UVS', 'ZAVKHAN',
];

export const districts = [
    'BAGANUUR', 'BAGAKHANGAI', 'BAYANGOL', 'BAYANZURKH', 'CHINGELTEI',
    'KHANUUL', 'NALAIKH', 'SONGINOKHAIRKHAN', 'SUKHBAATAR',
];
