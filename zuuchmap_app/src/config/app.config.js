export const PRICE_UNITS = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT'];

export const POST_STATUSES = ['ACTIVE', 'EXPIRED', 'RENTED'];

export const DEFAULT_AVATAR_URL = 'https://ui-avatars.com/api/?background=F5A623&color=1A1200&size=150&name=U';

export const APP_CONFIG = {
  APP_NAME: 'Zuuchmap',
  VERSION: '1.0.1',

  POST_TYPES: {
    VEHICLE_RENT: 'vehiclerent',
    TOOL_RENT: 'toolrent',
    MACHINERY_RENT: 'machineryrent',
    MATERIAL_STORE: 'materialstore',
    FACTORY: 'factory',
    CONSTRUCTION: 'construction',
    JOB_VACANCY: 'jobvacancy',
    SOS: 'sos',
  },
  
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

// Location option lists (value + Mongolian label)
export const provinces = [
    { value: 'ULAANBAATAR', label: 'Улаанбаатар' },
    { value: 'ARKHANGAI', label: 'Архангай' },
    { value: 'BAYANOLGII', label: 'Баян-Өлгий' },
    { value: 'BAYANKHONGOR', label: 'Баянхонгор' },
    { value: 'BULGAN', label: 'Булган' },
    { value: 'DARKHANUUL', label: 'Дархан-Уул' },
    { value: 'DORNOD', label: 'Дорнод' },
    { value: 'DORNOGOVI', label: 'Дорноговь' },
    { value: 'DUNDGOVI', label: 'Дундговь' },
    { value: 'GOVIALTAI', label: 'Говь-Алтай' },
    { value: 'GOVISUMBER', label: 'Говьсүмбэр' },
    { value: 'KHENTII', label: 'Хэнтий' },
    { value: 'KHOVD', label: 'Ховд' },
    { value: 'KHUVSGUL', label: 'Хөвсгөл' },
    { value: 'UMNUGOVI', label: 'Өмнөговь' },
    { value: 'ORKHON', label: 'Орхон' },
    { value: 'UVURKHANGAI', label: 'Өвөрхангай' },
    { value: 'SELENGE', label: 'Сэлэнгэ' },
    { value: 'SUKHBAATAR', label: 'Сүхбаатар' },
    { value: 'TUV', label: 'Төв' },
    { value: 'UVS', label: 'Увс' },
    { value: 'ZAVKHAN', label: 'Завхан' }
];

export const districts = [
    { value: 'BAGANUUR', label: 'Багануур' },
    { value: 'BAGAKHANGAI', label: 'Багахангай' },
    { value: 'BAYANGOL', label: 'Баянгол' },
    { value: 'BAYANZURKH', label: 'Баянзүрх' },
    { value: 'CHINGELTEI', label: 'Чингэлтэй' },
    { value: 'KHANUUL', label: 'Хан-Уул' },
    { value: 'NALAIKH', label: 'Налайх' },
    { value: 'SONGINOKHAIRKHAN', label: 'Сонгинохайрхан' },
    { value: 'SUKHBAATAR', label: 'Сүхбаатар' }
];
