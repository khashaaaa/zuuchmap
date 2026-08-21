import { palettes, categoryColors } from '../design/theme';
import { formatPrice } from './displayUtils';
import i18n from 'i18next';

// Category keys arrive from CategorySelectScreen/API as lowercase schema keys
export const categoryToPostType = (category) => category?.toLowerCase() || null;

export const normalizePostType = (postType) => postType?.toLowerCase() || null;

// Per-category icon and colour for badges and map markers, read from the
// category schema so a new vertical needs no app release. `icon` holds an
// Ionicons name and `color` a hex, both editable in the admin category UI.
// Pass the palette from useAppTheme() for the fallback when schemas aren't
// loaded yet or the category has no icon set.
export const getPostTypeConfig = (postType, colors = palettes.dark, schemas = []) => {
  const key = normalizePostType(postType);
  const schema = schemas.find((s) => s.key === key);
  return {
    iconName: schema?.icon || 'pricetag-outline',
    // Falling back to grey made an un-coloured category look broken rather than
    // merely unconfigured; fall back to its slot in the category family instead.
    color: schema?.color || categoryColors[key] || colors.text.secondary,
  };
};

// Human-readable post title derived from post fields + attributes
export const getPostTitle = (post, postType) => {
  if (post.title) return post.title;
  const key = normalizePostType(postType || post.category);
  const attrs = post.attributes || {};
  // Derive from whichever identifying attributes the category defines, rather
  // than from a list of category keys — any vertical reusing these field keys
  // gets the same treatment for free.
  const name = [attrs.manufacturer, attrs.model].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (attrs.position) return attrs.position;
  return post.name || post.subcategory || i18n.t('category.' + key, { defaultValue: key });
};

// Locale-aware labels resolved from the category schema, falling back to client i18n
export const getSchemaLabel = (schema) => {
  if (!schema) return '';
  return schema.labels?.[i18n.language]
    ?? i18n.t('category.' + schema.key, { defaultValue: schema.label ?? schema.key });
};

export const getSubcategoryLabel = (value, schema) => {
  if (!value) return '';
  const sub = schema?.subcategories?.find((s) => s.value === value);
  return sub?.labels?.[i18n.language]
    ?? i18n.t('subcategory.' + value, { defaultValue: sub?.display ?? value });
};

// Normalizes image URLs — handles legacy path mismatches and falls back gracefully
export const getFixedImageUrl = (url) => {
  if (!url) return null;
  // All new images are under /uploads/posts/. The map below is a frozen record
  // of the per-category directories used before that change — it is historical
  // data, not a category list, so new verticals never need an entry here.
  const legacyPaths = {
    '/uploads/sos/': '/uploads/posts/',
    '/uploads/vehiclerent/': '/uploads/posts/',
    '/uploads/toolrent/': '/uploads/posts/',
    '/uploads/machineryrent/': '/uploads/posts/',
    '/uploads/materialstore/': '/uploads/posts/',
    '/uploads/construction/': '/uploads/posts/',
    '/uploads/factory/': '/uploads/posts/',
    '/uploads/jobvacancy/': '/uploads/posts/',
  };
  let fixed = url;
  for (const [old, next] of Object.entries(legacyPaths)) {
    if (fixed.includes(old)) { fixed = fixed.replace(old, next); break; }
  }
  return fixed;
};

export const getStatusConfig = (status, colors = palettes.dark) => {
  if (!status) return null;
  const map = {
    ACTIVE:   { color: colors.success       },
    RENTED:   { color: colors.danger        },
    EXPIRED:  { color: colors.text.tertiary },
  };
  const key = status.toUpperCase();
  return map[key] || { color: colors.text.secondary };
};

export const getPostPrice = (post) => {
  const attrs = post.attributes || {};
  if (attrs.salary_range) return attrs.salary_range;
  if (post.price_amount) return formatPrice(post.price_amount, post.price_unit);
  return null;
};

export const getPostImage = (post) =>
  Array.isArray(post?.images) && post.images.length > 0 ? post.images[0] : null;

export const getSearchableText = (post) => {
  if (post.searchableText) return post.searchableText;
  const attrs = post.attributes || {};
  const text = [
    post.title, post.name, post.details, post.description,
    post.category, post.subcategory,
    attrs.manufacturer, attrs.model, attrs.position,
    post.address, post.province, post.district,
  ].filter(Boolean).join(' ').toLowerCase();
  post.searchableText = text;
  return text;
};

// Ensures post.postType and post.post_type are both set consistently
