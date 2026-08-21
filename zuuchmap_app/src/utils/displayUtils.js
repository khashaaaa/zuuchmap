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

export const formatDateYYYYMMDD = (dateString) => {
    if (!dateString) return i18n.t('common.unknown');
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return i18n.t('common.invalidDate');
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        logger.error('Date formatting error:', error);
        return i18n.t('common.invalidDate');
    }
};

export const formatDateTimeYYYYMMDD = (dateString) => {
    if (!dateString) return i18n.t('common.unknown');
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return i18n.t('common.invalidDate');
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
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
    const unitLabel = getPriceUnitLabel(priceUnit);
    return unitLabel ? `${formattedAmount}₮ / ${unitLabel}` : `${formattedAmount}₮`;
};
