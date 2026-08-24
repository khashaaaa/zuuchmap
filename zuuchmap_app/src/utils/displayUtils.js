import { logger } from './logger';
import i18n from '../i18n';


export const getProvinceLabel = (provinceCode) => {
    if (!provinceCode) return i18n.t('common.locationUnknown');
    return i18n.t(`province.${provinceCode}`, { defaultValue: provinceCode });
};

export const getDistrictLabel = (districtCode) => {
    if (!districtCode) return '';
    return i18n.t(`district.${districtCode}`, { defaultValue: districtCode });
};

// --- Date formatting ---
//
// `YYYY.MM.DD` — the Mongolian convention, and the same string the web client
// produces via toLocaleDateString('mn-MN'). The two used to disagree: a booking
// window read 2026.08.24 on the web and 2026-08-24 in the app. Built by hand
// rather than through Intl because React Native's JSC ships without full ICU on
// Android, so a locale-driven format would silently fall back to en-US there.
const DATE_SEPARATOR = '.';

const parts = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return {
        date,
        y: date.getFullYear(),
        m: String(date.getMonth() + 1).padStart(2, '0'),
        d: String(date.getDate()).padStart(2, '0'),
    };
};

export const formatDate = (dateString) => {
    // An em dash, matching the web client: a missing date is a blank, not a
    // claim that the value is unknown.
    if (!dateString) return '—';
    try {
        const p = parts(dateString);
        if (!p) return i18n.t('common.invalidDate');
        return [p.y, p.m, p.d].join(DATE_SEPARATOR);
    } catch (error) {
        logger.error('Date formatting error:', error);
        return i18n.t('common.invalidDate');
    }
};

export const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    try {
        const p = parts(dateString);
        if (!p) return i18n.t('common.invalidDate');
        const hours = String(p.date.getHours()).padStart(2, '0');
        const minutes = String(p.date.getMinutes()).padStart(2, '0');
        return `${[p.y, p.m, p.d].join(DATE_SEPARATOR)} ${hours}:${minutes}`;
    } catch (error) {
        logger.error('DateTime formatting error:', error);
        return i18n.t('common.invalidDate');
    }
};

// --- Price formatting ---

export const getPriceUnitLabel = (priceUnit) => {
    if (!priceUnit) return '';
    return i18n.t(`priceUnit.${priceUnit}`, { defaultValue: priceUnit });
};

export const formatPrice = (priceAmount, priceUnit) => {
    if (!priceAmount) return null;
    // price_amount arrives as a Postgres decimal string ("250000.00"); coerce
    // before formatting so thousands-grouping applies and the .00 tail is dropped.
    const amount = Number(priceAmount);
    if (Number.isNaN(amount)) return null;
    const formattedAmount = amount.toLocaleString('mn-MN', { maximumFractionDigits: 0 });
    // A total (sale) price is the whole amount — a "/unit" suffix would misread as recurring
    if (priceUnit === 'TOTAL') return `${formattedAmount}₮`;
    const unitLabel = getPriceUnitLabel(priceUnit);
    return unitLabel ? `${formattedAmount}₮/${unitLabel}` : `${formattedAmount}₮`;
};
