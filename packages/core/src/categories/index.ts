
export const FAMILIES = {
  EQUIPMENT_VEHICLES: {
    key: 'EQUIPMENT_VEHICLES',
    icon: 'truck',
    categories: ['vehiclerent', 'machineryrent', 'toolrent', 'usedequipment', 'transport'],
    labels: { mn: 'Техник, тээвэр', en: 'Equipment & vehicles', zh: '设备与车辆', ru: 'Техника и транспорт' },
  },
  MATERIALS_PRODUCTION: {
    key: 'MATERIALS_PRODUCTION',
    icon: 'package',
    categories: ['materialstore', 'factory'],
    labels: { mn: 'Материал, үйлдвэрлэл', en: 'Materials & production', zh: '材料与生产', ru: 'Материалы и производство' },
  },
  SERVICES: {
    key: 'SERVICES',
    icon: 'wrench',
    categories: ['construction', 'designservice', 'miningsupport', 'winterservice', 'sos'],
    labels: { mn: 'Үйлчилгээ', en: 'Services', zh: '服务', ru: 'Услуги' },
  },
  JOBS: {
    key: 'JOBS',
    icon: 'briefcase',
    categories: ['jobvacancy'],
    labels: { mn: 'Ажлын байр', en: 'Jobs', zh: '招聘', ru: 'Вакансии' },
  },
} as const;

export type FamilyKey = keyof typeof FAMILIES;
export type CategoryKey = (typeof FAMILIES)[FamilyKey]['categories'][number];

export const FAMILY_KEYS = Object.keys(FAMILIES) as FamilyKey[];
export const CATEGORY_KEYS: readonly CategoryKey[] = FAMILY_KEYS.flatMap(
  (f) => FAMILIES[f].categories as readonly CategoryKey[],
);

/** The family a category belongs to; undefined for an unknown (e.g. admin-added) category. */
export const familyOf = (categoryKey: string | null | undefined): FamilyKey | undefined =>
  FAMILY_KEYS.find((f) => (FAMILIES[f].categories as readonly string[]).includes(categoryKey ?? ''));

/**
 * An icon name (admin-editable, may be legacy Ionicons) is used only if it is
 * one of the shipped names; otherwise the category's family icon. An unknown
 * category with no family falls back to `package`.
 */
export const categoryIconFallback = (
  iconName: string | null | undefined,
  categoryKey: string | null | undefined,
  shippedIcons: ReadonlySet<string> | readonly string[] = [],
): string => {
  const set = shippedIcons instanceof Set ? shippedIcons : new Set(shippedIcons as readonly string[]);
  if (iconName && set.has(iconName)) return iconName;
  const family = familyOf(categoryKey);
  return family ? FAMILIES[family].icon : 'package';
};
export * from './health.js';
