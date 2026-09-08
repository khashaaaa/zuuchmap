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
/**
 * `initialPost` is the row; `content` is what the owner should be editing.
 *
 * They differ only while an edit sits in moderation: the row keeps serving the
 * approved version to everyone browsing, so the price it carries is the old
 * one. Rental status and the availability window are never part of a revision —
 * they apply live — so those always come from the row.
 */
const applyBehaviorFields = (formData, schema, initialPost = null, content = initialPost) => {
    if (schema?.has_rental_status) {
        formData.status = initialPost?.status || 'ACTIVE';
    }
    if (schema?.has_price) {
        // price_amount arrives as a Postgres decimal string ("4100000.00").
        // The currency input strips it to digits, so the ".00" became two more
        // zeros and every existing listing opened for edit showing 100x its
        // price — which the owner would then "correct". Prices are whole
        // tögrög, so round to an integer here, at the one place the row
        // becomes form state.
        formData.price_amount = content?.price_amount
            ? String(Math.round(Number(content.price_amount)))
            : '';
        formData.price_unit = content?.price_unit || schema.default_price_unit || 'DAY';
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

    // An edit the owner has already submitted and is still waiting on. Loading
    // the row instead would show them their own pre-edit wording back and read
    // as "my change was lost".
    const content = initialPost.pending_revision ?? initialPost;

    return applyBehaviorFields({
        subcategory: content.subcategory || '',
        province: content.province || 'ULAANBAATAR',
        district: content.district || 'BAYANZURKH',
        title: content.title || '',
        details: content.details || '',
        contact_phone: content.contact_phone || '',
        latitude: content.latitude || null,
        longitude: content.longitude || null,
        location: content.location || '',
        images: processExistingImages(content.images),
        attributes: buildAttributes(schema, content.attributes || {}),
    }, schema, initialPost, content);
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
