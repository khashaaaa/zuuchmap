// Mirrors zuuchmap_engine/src/enums/priceunit.ts — keep in sync.
export const PRICE_UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL'];

export const DEFAULT_AVATAR_URL = 'https://ui-avatars.com/api/?background=F5A623&color=1A1200&size=150&name=U';

export const APP_CONFIG = {
  IMAGE: {
    COMPRESSION_QUALITY: 0.7,
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
