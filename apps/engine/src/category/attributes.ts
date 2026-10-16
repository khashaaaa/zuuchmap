import type { AttributeCheck, AttributeIssue, FieldDef } from './category.types';

interface SchemaLike {
  key: string;
  active: boolean;
  subcategories: Array<{ value: string }>;
  fields: FieldDef[];
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Pure check of listing attributes against a category schema. Never throws. */
export function checkAttributes(
  schema: SchemaLike | null | undefined,
  subcategory: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
  /** A draft: everything given must be valid, but required fields may still be missing. */
  partial = false,
): AttributeCheck {
  const errors: AttributeIssue[] = [];
  const out: Record<string, unknown> = {};
  if (!schema || !schema.active) {
    return {
      ok: false,
      attributes: out,
      errors: [{ key: 'category', code: 'unknown_category', message: 'Unknown category' }],
    };
  }
  if (subcategory && schema.subcategories.length > 0 && !schema.subcategories.some((s) => s.value === subcategory)) {
    errors.push({ key: 'subcategory', code: 'unknown_subcategory', message: `Unknown subcategory '${subcategory}'` });
  }
  const attrs = attributes ?? {};
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  for (const key of Object.keys(attrs)) {
    if (!byKey.has(key)) errors.push({ key, code: 'unknown_field', message: `Unknown attribute '${key}'` });
  }
  for (const f of schema.fields) {
    const raw = attrs[f.key];
    if (isEmpty(raw)) {
      if (f.required && !partial) errors.push({ key: f.key, code: 'required', message: `'${f.key}' is required` });
      continue;
    }
    const bad = (code: AttributeIssue['code'], message: string) => errors.push({ key: f.key, code, message });
    switch (f.type) {
      case 'number': {
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
        if (!Number.isFinite(n)) {
          bad('type', `'${f.key}' must be a number`);
          break;
        }
        if (f.min !== undefined && n < f.min) bad('min', `'${f.key}' must be at least ${f.min}`);
        else if (f.max !== undefined && n > f.max) bad('max', `'${f.key}' must be at most ${f.max}`);
        else out[f.key] = n;
        break;
      }
      case 'select':
        if (typeof raw !== 'string') bad('type', `'${f.key}' must be a string`);
        else if (!(f.options ?? []).includes(raw)) bad('option', `'${f.key}' must be one of ${(f.options ?? []).join(', ')}`);
        else out[f.key] = raw;
        break;
      case 'multiselect':
        if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) bad('type', `'${f.key}' must be a list of strings`);
        else if (raw.some((x: string) => !(f.options ?? []).includes(x))) bad('option', `'${f.key}' has a value outside its options`);
        else out[f.key] = raw;
        break;
      case 'boolean':
        if (typeof raw !== 'boolean') bad('type', `'${f.key}' must be true or false`);
        else out[f.key] = raw;
        break;
      case 'date':
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(Date.parse(raw))) {
          bad('type', `'${f.key}' must be an ISO date`);
        } else out[f.key] = raw;
        break;
      case 'phone': {
        const digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
        if (typeof raw !== 'string' || !/^\+?[\d\s()-]+$/.test(raw) || digits.length < 6 || digits.length > 15) {
          bad('type', `'${f.key}' must be a phone number`);
        } else out[f.key] = raw.trim();
        break;
      }
      case 'text':
      case 'textarea': {
        const max = f.type === 'text' ? 200 : 5000;
        if (typeof raw !== 'string') bad('type', `'${f.key}' must be a string`);
        else if (raw.length > max) bad('max', `'${f.key}' must be at most ${max} characters`);
        else out[f.key] = raw.trim();
        break;
      }
    }
  }
  return { ok: errors.length === 0, attributes: out, errors };
}
