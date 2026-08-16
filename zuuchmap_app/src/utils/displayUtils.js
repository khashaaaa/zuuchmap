import { logger } from './logger';
import i18n from '../i18n';

export const getSubcategoryDisplayName = (subcategoryName) => {
    if (!subcategoryName) return '';
    return i18n.t(`subcategory.${subcategoryName}`, { defaultValue: subcategoryName });
};

export const getProvinceLabel = (provinceCode, provinces = []) => {
    if (!provinceCode) return i18n.t('common.locationUnknown');
    if (!provinces || provinces.length === 0) {
        logger.warn('getProvinceLabel: provinces array not provided');
        return provinceCode;
    }
    const province = provinces.find(p => p.value === provinceCode);
    return province ? province.label : provinceCode;
};

export const getDistrictLabel = (districtCode, districts = []) => {
    if (!districtCode) return '';
    if (!districts || districts.length === 0) return districtCode;
    const district = districts.find(d => d.value === districtCode);
    return district ? district.label : districtCode;
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
    const formattedAmount = priceAmount.toLocaleString('mn-MN');
    const unitLabel = getPriceUnitLabel(priceUnit);
    return unitLabel ? `${formattedAmount}₮ / ${unitLabel}` : `${formattedAmount}₮`;
};
