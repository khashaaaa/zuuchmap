import postService from '../services/api/postService';
import { getSubcategoryLabel } from './postUtils';

// Attribute values initialized from the category schema's field definitions
// A boolean must start `false` and a multiselect `[]` — seeding them with ''
// hands <Switch> a string and breaks the chip toggle's Array checks.
const emptyAttribute = (f) => {
    if (f.type === 'boolean') return false;
    if (f.type === 'multiselect') return [];
    if (f.type === 'select') return f.options?.[0] ?? '';
    return '';
};

const buildAttributes = (schema, existing = {}) =>
    Object.fromEntries((schema?.fields ?? []).map((f) => [
        f.key,
        existing[f.key] ?? emptyAttribute(f),
    ]));

const oneMonthAhead = () => new Date(new Date().setMonth(new Date().getMonth() + 1));

// Behavior (status/price/dates) comes from schema flags, never from hardcoded category lists
const applyBehaviorFields = (formData, schema, initialPost = null) => {
    if (schema?.has_rental_status) {
        formData.status = initialPost?.status || 'ACTIVE';
    }
    if (schema?.has_price) {
        formData.price_amount = initialPost?.price_amount ? initialPost.price_amount.toString() : '';
        formData.price_unit = initialPost?.price_unit || schema.default_price_unit || 'DAY';
    }
    if (schema?.has_availability_dates) {
        formData.available_from = initialPost?.available_from ? new Date(initialPost.available_from) : new Date();
        formData.available_until = initialPost?.available_until ? new Date(initialPost.available_until) : oneMonthAhead();
    }
    return formData;
};

export const getInitialFormData = (schema, subcategory, location) => applyBehaviorFields({
    subcategory: subcategory || '',
    province: 'ULAANBAATAR',
    district: 'BAYANZURKH',
    title: '',
    details: '',
    contact_phone: '',
    latitude: location.latitude,
    longitude: location.longitude,
    location: location.locationName,
    images: [],
    attributes: buildAttributes(schema),
}, schema);

export const getEditFormData = (schema, initialPost) => {
    const processExistingImages = (images) => {
        if (!images || !Array.isArray(images)) return [];
        return images.map(image => {
            if (typeof image === 'string' && !image.startsWith('http')) {
                return `${postService.getApiUrl()}/uploads/posts/${image}`;
            }
            return image;
        });
    };

    return applyBehaviorFields({
        subcategory: initialPost.subcategory || '',
        province: initialPost.province || 'ULAANBAATAR',
        district: initialPost.district || 'BAYANZURKH',
        title: initialPost.title || '',
        details: initialPost.details || '',
        contact_phone: initialPost.contact_phone || '',
        latitude: initialPost.latitude || null,
        longitude: initialPost.longitude || null,
        location: initialPost.location || '',
        images: processExistingImages(initialPost.images),
        attributes: buildAttributes(schema, initialPost.attributes || {}),
    }, schema, initialPost);
};

// --- Title suggestion ---
//
// Photo-first creation: the provider picks a picture before typing anything,
// so the title is derived — "Экскаватор Komatsu PC200" — from the subcategory
// label plus the first identifying attribute they filled. Only free-text and
// number fields count: a select seeds itself with its first option, so it
// would name every post after a default nobody chose.
export const suggestTitle = (formData, schema) => {
    if (!formData) return '';
    const sub = formData.subcategory ? getSubcategoryLabel(formData.subcategory, schema) : '';
    const attrs = formData.attributes ?? {};
    const firstAttr = (schema?.fields ?? []).find((f) => {
        if (!['text', 'number', 'string'].includes(f.type ?? 'text')) return false;
        const v = attrs[f.key];
        return typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0);
    });
    const attrText = firstAttr
        ? `${String(attrs[firstAttr.key]).trim()}${firstAttr.unit ? ` ${firstAttr.unit}` : ''}`
        : '';
    return [sub, attrText].filter(Boolean).join(' ').slice(0, 200);
};

// --- Validation ---
export const validateEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const validatePhone = (phone, minLength = 8, maxLength = 15) => {
    if (!phone || typeof phone !== 'string') return false;
    const digitsOnly = phone.replace(/[^\d]/g, '');
    return /^\d+$/.test(digitsOnly) && digitsOnly.length >= minLength && digitsOnly.length <= maxLength;
};

export const validateRequired = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
};

// A provider types "example.mn", not "https://example.mn". Normalising beats
// rejecting: the value is only ever used as an href, and a bare domain in the
// database is a dead link. Mirrored in zuuchmap_web/src/lib/utils.js and checked
// by `npm run check:sync` — the web used to reject the bare domain outright
// (input type="url") where the app quietly accepted and fixed it.
export const normalizeWebsiteUrl = (url) => {
    if (!url || url.trim() === '') return '';
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

// --- Form data API formatting ---
export const formatFormDataForApi = (formData) => {
    const formatted = { ...formData };
    if ('price_amount' in formatted) {
        if (formatted.price_amount !== null && formatted.price_amount !== undefined && formatted.price_amount !== '') {
            formatted.price_amount = Number(formatted.price_amount);
        } else {
            formatted.price_amount = null;
        }
    }
    const dateFields = ['available_from', 'available_until'];
    dateFields.forEach(field => {
        if (field in formatted) {
            formatted[field] = formatted[field]
                ? (formatted[field] instanceof Date ? formatted[field] : new Date(formatted[field]))
                : null;
        }
    });
    return formatted;
};
