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

/**
 * Human-readable post title. `title` is nullable server-side, so most of this
 * function is the fallback chain for an untitled post:
 *
 *   title → "manufacturer model" → subcategory label → category label
 *
 * Derived from whichever identifying attributes the category defines rather
 * than from a list of category keys, so any vertical reusing these field keys
 * gets the same treatment for free.
 *
 * MIRRORED in `zuuchmap_web/src/lib/utils.js` — the two used to disagree, and
 * an untitled excavator listing read "Komatsu PC200-8" in the app but
 * "Machinery Rental" on the web, including in the two admin queues. Change
 * both together; `scripts/check-sync.js` fails the build if they drift.
 */
export const getPostTitle = (post, postType, schema) => {
  if (post?.title) return post.title;
  const key = normalizePostType(postType || post?.category);
  const attrs = post?.attributes || {};
  const name = [attrs.manufacturer, attrs.model].filter(Boolean).join(' ').trim();
  if (name) return name;
  // Only 42 of the 79 seeded subcategory values carry a client i18n key, so a
  // subcategory is used as a title only when it actually resolved to something
  // human — otherwise "excavator" would ship as the visible title. Passing the
  // category `schema` widens this to every value the admin has labelled.
  const sub = post?.subcategory ? getSubcategoryLabel(post.subcategory, schema) : '';
  if (sub && sub !== post.subcategory) return sub;
  // An em dash rather than the word "unknown": a post with no category at all
  // is a blank, not a claim. Matches the web fallback.
  return key ? i18n.t('category.' + key, { defaultValue: key }) : '—';
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
    // Post lifecycle
    ACTIVE:   { color: colors.success       },
    RENTED:   { color: colors.danger        },
    EXPIRED:  { color: colors.text.tertiary },
    // Moderation. These belong here too: the badge resolves any status through
    // this map, so leaving them out dropped PENDING and REJECTED to the same
    // grey fallback — a rejected post looked exactly like one still in review.
    PENDING:  { color: colors.warning       },
    APPROVED: { color: colors.success       },
    REJECTED: { color: colors.danger        },
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

// Ensures post.postType and post.post_type are both set consistently
