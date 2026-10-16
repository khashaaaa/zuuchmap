/* eslint-disable @typescript-eslint/no-unnecessary-condition -- admin request bodies and jsonb rows are untrusted at runtime */
import { BadRequestException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FAMILIES,
  FAMILY_KEYS,
  categoryIconFallback,
  familyOf,
  type CategoryFamilyView,
  type CategoryFieldView,
  type CategoryView,
  type FamilyKey,
  type Locale,
  type PrimaryAction,
} from '@zuuchmap/core';
import { env } from '../config/env';
import { checkAttributes } from './attributes';
import { CategorySchema } from './category.entity';
import type { AttributeCheck, CategoryCountProvider, FieldDef, SubcategoryDef } from './category.types';
import { SHIPPED_ICON_NAMES } from './icons';
import { CATEGORY_SEED } from './seed/category-seed';

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone'];
// Listing column names; schema attribute keys must not shadow them.
const RESERVED_FIELD_KEYS = [
  'id', 'category', 'subcategory', 'title', 'details', 'province', 'district', 'address', 'latitude', 'longitude',
  'location', 'price_amount', 'price_unit', 'contact_phone', 'contact_email', 'available_from', 'available_until',
  'website', 'images', 'attributes', 'views', 'status', 'approval_status', 'rejection_reason', 'expires_at', 'user',
  'date_created', 'date_updated', 'search_vector',
];
const LOCALES: Locale[] = ['mn', 'en', 'zh', 'ru'];
const SNAKE = /^[a-z0-9_]+$/;

export interface CategoryUpsertInput {
  family?: string;
  label?: string;
  labels?: Record<string, string>;
  icon?: string | null;
  color?: string | null;
  subcategories?: SubcategoryDef[];
  fields?: FieldDef[];
  has_rental_status?: boolean;
  has_availability_dates?: boolean;
  has_price?: boolean;
  default_price_unit?: string | null;
  emphasized?: boolean;
  rentable?: boolean;
  sos?: boolean;
  post_expiry_days?: number | null;
  active?: boolean;
  sort_order?: number;
}

export function primaryActionOf(c: { rentable: boolean; sos: boolean }): PrimaryAction {
  if (c.sos) return 'CALL_NOW';
  if (c.rentable) return 'BOOK';
  return 'CALL';
}

const pick = (labels: Record<string, string> | null | undefined, locale: Locale, fallback: string): string =>
  labels?.[locale] || labels?.mn || fallback;

@Injectable()
export class CategoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CategoryService.name);
  private countProvider: CategoryCountProvider | null = null;

  constructor(@InjectRepository(CategorySchema) private readonly repo: Repository<CategorySchema>) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!env().CATEGORY_SEED_ON_BOOT) return;
    try {
      const added = await this.seed();
      if (added > 0) this.logger.log(`Seeded ${added} categories`);
    } catch (err) {
      this.logger.warn(`Category seed skipped: ${(err as Error).message}`);
    }
  }

  /** The listings module registers how live listings are counted per category key. */
  setCountProvider(provider: CategoryCountProvider): void {
    this.countProvider = provider;
  }

  /** Inserts seed categories that do not exist yet; never overwrites admin edits. Returns rows added. */
  async seed(): Promise<number> {
    const have = new Set((await this.repo.find({ select: { key: true } })).map((c) => c.key));
    const fresh = CATEGORY_SEED.filter((s) => !have.has(s.key));
    if (fresh.length === 0) return 0;
    await this.repo
      .createQueryBuilder()
      .insert()
      .values(
        fresh.map((s) => ({
          key: s.key,
          family: s.family,
          label: s.label,
          labels: s.labels,
          icon: s.icon,
          color: s.color ?? null,
          subcategories: s.subcategories,
          fields: s.fields,
          has_rental_status: s.has_rental_status ?? false,
          has_availability_dates: s.has_availability_dates ?? false,
          has_price: s.has_price ?? false,
          default_price_unit: s.default_price_unit ?? null,
          emphasized: s.emphasized ?? false,
          rentable: s.rentable,
          sos: s.sos,
          post_expiry_days: s.post_expiry_days ?? null,
          sort_order: s.sort_order,
        })),
      )
      .orIgnore()
      .execute();
    return fresh.length;
  }

  async listEntities(includeInactive = false): Promise<CategorySchema[]> {
    return this.repo.find({
      where: includeInactive ? {} : { active: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async get(key: string): Promise<CategorySchema> {
    const c = await this.repo.findOne({ where: { key } });
    if (!c) throw new NotFoundException(`Category '${key}' not found`);
    return c;
  }

  async list(locale: Locale): Promise<CategoryView[]> {
    return (await this.listEntities()).map((c) => this.toView(c, locale));
  }

  async getView(key: string, locale: Locale): Promise<CategoryView> {
    const c = await this.get(key);
    if (!c.active) throw new NotFoundException(`Category '${key}' not found`);
    return this.toView(c, locale);
  }

  /** The icon a client should render: the stored name if shipped, otherwise the family icon. */
  resolveIcon(icon: string | null, key: string, family: string): string {
    if (icon && SHIPPED_ICON_NAMES.has(icon)) return icon;
    if (familyOf(key)) return categoryIconFallback(icon, key, SHIPPED_ICON_NAMES);
    return (FAMILY_KEYS as string[]).includes(family) ? FAMILIES[family as FamilyKey].icon : 'package';
  }

  toView(c: CategorySchema, locale: Locale): CategoryView {
    const family = (FAMILY_KEYS as string[]).includes(c.family) ? (c.family as FamilyKey) : familyOf(c.key);
    return {
      key: c.key,
      family: c.family,
      family_label: family ? FAMILIES[family].labels[locale] : c.family,
      label: pick(c.labels, locale, c.label),
      icon: this.resolveIcon(c.icon, c.key, c.family),
      color: c.color,
      subcategories: (c.subcategories ?? []).map((s) => ({ value: s.value, label: pick(s.labels, locale, s.display) })),
      fields: (c.fields ?? []).map((f): CategoryFieldView => {
        const { labels, placeholders, ...rest } = f;
        return {
          ...rest,
          label: pick(labels, locale, f.label),
          ...(f.placeholder !== undefined || placeholders
            ? { placeholder: pick(placeholders, locale, f.placeholder ?? '') }
            : {}),
        };
      }),
      has_rental_status: c.has_rental_status,
      has_availability_dates: c.has_availability_dates,
      has_price: c.has_price,
      default_price_unit: c.default_price_unit,
      emphasized: c.emphasized,
      rentable: c.rentable,
      sos: c.sos,
      pinned: c.sos,
      primary_action: primaryActionOf(c),
      post_expiry_days: c.post_expiry_days,
      sort_order: c.sort_order,
    };
  }

  /** Families with their categories and live-listing counts (0 until a count provider is registered). */
  async families(locale: Locale, provider?: CategoryCountProvider): Promise<CategoryFamilyView[]> {
    const counts = (await (provider ?? this.countProvider)?.()) ?? {};
    const cats = await this.listEntities();
    return FAMILY_KEYS.map((fk) => {
      const keys = cats.filter((c) => c.family === fk).map((c) => c.key);
      return {
        key: fk,
        icon: FAMILIES[fk].icon,
        label: FAMILIES[fk].labels[locale],
        categories: keys,
        count: keys.reduce((n, k) => n + (counts[k] ?? 0), 0),
      };
    });
  }

  /** Admin create-or-update by key. Partial on update; family is required on create. */
  async upsert(key: string, input: CategoryUpsertInput): Promise<CategorySchema> {
    if (!SNAKE.test(key)) throw new BadRequestException(`Invalid category key '${key}' — use a-z, 0-9, _`);
    const existing = await this.repo.findOne({ where: { key } });
    this.validateInput(input, !existing);
    let row = existing;
    if (!row) {
      row = this.repo.create({
        key,
        family: input.family as string,
        label: input.label as string,
        labels: {},
        icon: null,
        color: null,
        subcategories: [],
        fields: [],
        default_price_unit: null,
        post_expiry_days: null,
        sort_order: 0,
      });
    }
    const { labels, ...rest } = input;
    Object.assign(row, rest);
    if (labels) row.labels = labels;
    if (input.label && !labels) row.labels = { ...row.labels, mn: input.label };
    return this.repo.save(row);
  }

  validateInput(d: CategoryUpsertInput, creating: boolean): void {
    const bad = (m: string): never => {
      throw new BadRequestException(m);
    };
    if (creating) {
      if (!d.label?.trim()) bad('label is required');
      if (!d.labels) bad('labels (mn en zh ru) are required');
    }
    if (d.family !== undefined || creating) {
      if (!d.family || !(FAMILY_KEYS as string[]).includes(d.family)) {
        bad(`family must be one of ${FAMILY_KEYS.join(', ')}`);
      }
    }
    if (d.labels) {
      for (const l of LOCALES) if (!d.labels[l]?.trim()) bad(`labels.${l} is required`);
    }
    if (d.icon !== undefined && d.icon !== null && !SHIPPED_ICON_NAMES.has(d.icon)) {
      bad(`Unknown icon '${d.icon}' — use a shipped Lucide name`);
    }
    if (d.color !== undefined && d.color !== null && !/^#[0-9a-fA-F]{6}$/.test(d.color)) {
      bad(`Invalid colour '${d.color}' — use a 6-digit hex such as #4CAF50`);
    }
    if (d.post_expiry_days !== undefined && d.post_expiry_days !== null) {
      if (!Number.isInteger(d.post_expiry_days) || d.post_expiry_days < 1 || d.post_expiry_days > 365) {
        bad('post_expiry_days must be a whole number between 1 and 365');
      }
    }
    const seen = new Set<string>();
    for (const f of d.fields ?? []) {
      if (!SNAKE.test(f.key ?? '')) bad(`Invalid field key '${f.key}' — use snake_case`);
      if (RESERVED_FIELD_KEYS.includes(f.key)) bad(`Field key '${f.key}' is reserved`);
      if (seen.has(f.key)) bad(`Duplicate field key '${f.key}'`);
      seen.add(f.key);
      if (!FIELD_TYPES.includes(f.type)) bad(`Invalid field type '${f.type}' for '${f.key}'`);
      if ((f.type === 'select' || f.type === 'multiselect') && !(Array.isArray(f.options) && f.options.length > 0)) {
        bad(`Field '${f.key}' requires at least one option`);
      }
      if (f.group !== undefined && f.group !== 'core' && f.group !== 'details') bad(`Invalid group for '${f.key}'`);
      if (f.required && f.group === 'details') bad(`Field '${f.key}' cannot be required and in the details group`);
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) bad(`Field '${f.key}' has min above max`);
    }
    const subs = new Set<string>();
    for (const s of d.subcategories ?? []) {
      if (!SNAKE.test(s.value ?? '')) bad(`Invalid subcategory value '${s.value}'`);
      if (subs.has(s.value)) bad(`Duplicate subcategory value '${s.value}'`);
      subs.add(s.value);
    }
  }

  /** Checks a listing's attributes against its category schema. Used by the listings module. */
  async validateAttributes(
    categoryKey: string,
    subcategory: string | null | undefined,
    attributes: Record<string, unknown> | null | undefined,
    partial = false,
  ): Promise<AttributeCheck> {
    const schema = await this.repo.findOne({ where: { key: categoryKey } });
    return checkAttributes(schema, subcategory, attributes, partial);
  }

  /** As validateAttributes, but throws a 400 carrying the issue list. Returns the coerced attributes. */
  async assertValidAttributes(
    categoryKey: string,
    subcategory: string | null | undefined,
    attributes: Record<string, unknown> | null | undefined,
    partial = false,
  ): Promise<Record<string, unknown>> {
    const r = await this.validateAttributes(categoryKey, subcategory, attributes, partial);
    if (!r.ok) throw new BadRequestException({ message: 'INVALID_ATTRIBUTES', errors: r.errors });
    return r.attributes;
  }
}
