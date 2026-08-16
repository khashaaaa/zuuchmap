import { palettes } from '../design/theme';
import { formatPrice } from './displayUtils';
import i18n from 'i18next';

// Category keys arrive from CategorySelectScreen/API as lowercase schema keys
export const categoryToPostType = (category) => category?.toLowerCase() || null;

export const normalizePostType = (postType) => postType?.toLowerCase() || null;

// Per-category icon and color — used for badges and map markers.
// Pass the current palette from useAppTheme() so results follow the theme.
export const getPostTypeConfig = (postType, colors = palettes.dark) => {
  const key = normalizePostType(postType);
  const configs = {
    vehiclerent:  { iconName: 'car-outline',      color: colors.success    },
    toolrent:     { iconName: 'construct-outline', color: colors.warning    },
    machineryrent:{ iconName: 'cog-outline',       color: colors.machinery  },
    materialstore:{ iconName: 'cube-outline',      color: colors.material   },
    construction: { iconName: 'build-outline',     color: colors.primary    },
    factory:      { iconName: 'business-outline',  color: colors.danger     },
    jobvacancy:   { iconName: 'briefcase-outline', color: colors.jobVacancy },
    sos:          { iconName: 'medkit-outline',    color: colors.sos        },
  };
  return configs[key] || { iconName: 'pricetag-outline', color: colors.text.secondary };
};

// Human-readable post title derived from post fields + attributes
export const getPostTitle = (post, postType) => {
  if (post.title) return post.title;
  const key = normalizePostType(postType || post.category);
  const attrs = post.attributes || {};
  if (key === 'vehiclerent' || key === 'toolrent' || key === 'machineryrent') {
    const name = `${attrs.manufacturer || ''} ${attrs.model || ''}`.trim();
    if (name) return name;
  }
  if (key === 'jobvacancy') return post.subcategory || attrs.position || i18n.t('category.jobvacancy');
  return post.name || post.subcategory || i18n.t('category.' + key);
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
  // All new images are under /uploads/posts/ — legacy paths are remapped
  const fixes = {
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
  for (const [old, next] of Object.entries(fixes)) {
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
export const normalizePostFields = (post) => {
  if (!post) return post;
  const out = { ...post };
  if (!out.post_type && out.category) out.post_type = out.category;
  if (!out.postType && out.category) out.postType = out.category;
  return out;
};
