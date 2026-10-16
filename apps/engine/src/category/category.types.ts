import type { FamilyKey, FieldDef, FieldType, LocalizedLabels } from '@zuuchmap/core';

export type { FieldDef, FieldType, LocalizedLabels };

export interface SubcategoryDef {
  value: string;
  display: string;
  labels?: LocalizedLabels;
}

/** category key -> number of live listings. The listings module supplies it. */
export type CategoryCountProvider = () => Promise<Record<string, number>>;

export interface AttributeIssue {
  key: string;
  code: 'unknown_category' | 'unknown_subcategory' | 'unknown_field' | 'required' | 'type' | 'option' | 'min' | 'max';
  message: string;
}

export interface AttributeCheck {
  ok: boolean;
  /** Attributes with numeric strings coerced; only meaningful when ok. */
  attributes: Record<string, unknown>;
  errors: AttributeIssue[];
}

export type { FamilyKey };
