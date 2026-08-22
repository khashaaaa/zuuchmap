import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Category expansion + naming audit.
 *
 * Adds five verticals (used equipment sales, transport & freight, design &
 * engineering, mining support, winter services) and repairs seed-data naming
 * in the original eight: "Дүүргэлтийн" was used where "Сантехник" (plumbing)
 * was meant, "Тэгшлэгч" (grader) where compactor was meant, "Тулгуур" (prop)
 * where scaffolding was meant, plus year-vs-date field labels and the van's
 * Chinese label. machineryrent/sos gain subcategories, construction gains
 * filterable fields.
 *
 * The seeder (`CategoryService.seedCategories`) carries the same data for
 * fresh databases; this migration brings already-seeded databases in line.
 * Like CategoryColourFamily, admin edits win: label fixes only replace the
 * exact old value, and subcategories/fields are appended only when their
 * value/key is not already present. New categories are skipped when the key
 * already exists. The new colours sit at the family luminance (4.0:1 on both
 * grounds); mirrors in app theme.js / web utils.js updated in the same change.
 *
 * New price units TOTAL and TRIP exist only as strings in `default_price_unit`
 * and client i18n — no schema change.
 */

type Sub = { value: string; display: string; labels: Record<string, string> };
type Field = Record<string, unknown> & { key: string };
type Row = { id: number; subcategories: Sub[] | null; fields: Field[] | null };

const NEW_CATEGORIES = [
  {
    key: 'usedequipment', label: 'Худалдах техник',
    labels: { mn: 'Худалдах техник', en: 'Used Equipment', zh: '二手设备买卖', ru: 'Продажа техники' },
    icon: 'pricetags-outline', color: '#C16546', sort_order: 8,
    has_rental_status: false, has_availability_dates: false, has_price: true, default_price_unit: 'TOTAL',
    subcategories: [
      { value: 'vehicle', display: 'Тээврийн хэрэгсэл', labels: { mn: 'Тээврийн хэрэгсэл', en: 'Vehicles', zh: '车辆', ru: 'Транспорт' } },
      { value: 'machinery', display: 'Машин техник', labels: { mn: 'Машин техник', en: 'Machinery', zh: '机械', ru: 'Техника' } },
      { value: 'tools', display: 'Багаж хэрэгсэл', labels: { mn: 'Багаж хэрэгсэл', en: 'Tools', zh: '工具', ru: 'Инструменты' } },
      { value: 'spare_parts', display: 'Сэлбэг', labels: { mn: 'Сэлбэг', en: 'Spare Parts', zh: '配件', ru: 'Запчасти' } },
    ],
    fields: [
      { key: 'manufacturer', label: 'Үйлдвэрлэгч/Брэнд', labels: { mn: 'Үйлдвэрлэгч/Брэнд', en: 'Manufacturer/Brand', zh: '制造商/品牌', ru: 'Производитель/Бренд' }, type: 'text', filterable: true },
      { key: 'model', label: 'Загвар', labels: { mn: 'Загвар', en: 'Model', zh: '型号', ru: 'Модель' }, type: 'text', filterable: true },
      { key: 'manufactured_date', label: 'Үйлдвэрлэсэн он', labels: { mn: 'Үйлдвэрлэсэн он', en: 'Manufactured year', zh: '生产年份', ru: 'Год выпуска' }, type: 'text', placeholder: '2015' },
      { key: 'condition', label: 'Байдал', labels: { mn: 'Байдал', en: 'Condition', zh: '成色', ru: 'Состояние' }, type: 'select', filterable: true, options: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR'] },
      { key: 'mileage', label: 'Гүйлт/Моточас', labels: { mn: 'Гүйлт/Моточас', en: 'Mileage / hours', zh: '里程/工作小时', ru: 'Пробег/моточасы' }, type: 'text', placeholder: '120,000 км' },
    ],
  },
  {
    key: 'transport', label: 'Тээвэр, ачаа',
    labels: { mn: 'Тээвэр, ачаа', en: 'Transport & Freight', zh: '运输货运', ru: 'Транспорт и грузоперевозки' },
    icon: 'cube-outline', color: '#4984B4', sort_order: 9,
    has_rental_status: true, has_availability_dates: false, has_price: true, default_price_unit: 'TRIP',
    subcategories: [
      { value: 'freight', display: 'Ачаа тээвэр', labels: { mn: 'Ачаа тээвэр', en: 'Freight', zh: '货运', ru: 'Грузоперевозки' } },
      { value: 'dump_truck', display: 'Самосвал', labels: { mn: 'Самосвал', en: 'Dump Truck', zh: '自卸车', ru: 'Самосвал' } },
      { value: 'crane_service', display: 'Крантай үйлчилгээ', labels: { mn: 'Крантай үйлчилгээ', en: 'Crane Service', zh: '吊车服务', ru: 'Услуги крана' } },
      { value: 'heavy_haul', display: 'Хүнд даацын тээвэр', labels: { mn: 'Хүнд даацын тээвэр', en: 'Heavy Haul', zh: '大件运输', ru: 'Негабаритные перевозки' } },
      { value: 'water_delivery', display: 'Ус хүргэлт', labels: { mn: 'Ус хүргэлт', en: 'Water Delivery', zh: '送水', ru: 'Доставка воды' } },
    ],
    fields: [
      { key: 'capacity_tons', label: 'Даац (тонн)', labels: { mn: 'Даац (тонн)', en: 'Capacity (tons)', zh: '载重（吨）', ru: 'Грузоподъёмность (т)' }, type: 'number', filterable: true, unit: 'т' },
      { key: 'service_route', label: 'Үйлчлэх чиглэл', labels: { mn: 'Үйлчлэх чиглэл', en: 'Service route/area', zh: '服务路线', ru: 'Маршрут' }, type: 'text', placeholder: 'УБ - Дархан' },
    ],
  },
  {
    key: 'designservice', label: 'Зураг төсөл, инженеринг',
    labels: { mn: 'Зураг төсөл, инженеринг', en: 'Design & Engineering', zh: '设计与工程', ru: 'Проектирование и инжиниринг' },
    icon: 'compass-outline', color: '#8473C3', sort_order: 10,
    has_rental_status: true, has_availability_dates: false, has_price: true, default_price_unit: 'PROJECT',
    subcategories: [
      { value: 'architecture', display: 'Архитектур', labels: { mn: 'Архитектур', en: 'Architecture', zh: '建筑设计', ru: 'Архитектура' } },
      { value: 'structural', display: 'Бүтээцийн инженер', labels: { mn: 'Бүтээцийн инженер', en: 'Structural Engineering', zh: '结构工程', ru: 'Конструкторские работы' } },
      { value: 'surveying', display: 'Геодези, хэмжилт', labels: { mn: 'Геодези, хэмжилт', en: 'Surveying', zh: '测量', ru: 'Геодезия' } },
      { value: 'soil_testing', display: 'Хөрсний шинжилгээ', labels: { mn: 'Хөрсний шинжилгээ', en: 'Soil Testing', zh: '土壤检测', ru: 'Исследование грунта' } },
      { value: 'permits', display: 'Зөвшөөрөл, баримт бичиг', labels: { mn: 'Зөвшөөрөл, баримт бичиг', en: 'Permits & Documentation', zh: '许可证办理', ru: 'Разрешения' } },
      { value: 'interior_design', display: 'Интерьер дизайн', labels: { mn: 'Интерьер дизайн', en: 'Interior Design', zh: '室内设计', ru: 'Дизайн интерьера' } },
    ],
    fields: [
      { key: 'experience_years', label: 'Туршлага (жил)', labels: { mn: 'Туршлага (жил)', en: 'Experience (years)', zh: '经验（年）', ru: 'Опыт (лет)' }, type: 'number', filterable: true },
      { key: 'license_info', label: 'Тусгай зөвшөөрөл', labels: { mn: 'Тусгай зөвшөөрөл', en: 'License info', zh: '资质证书', ru: 'Лицензия' }, type: 'text' },
    ],
  },
  {
    key: 'miningsupport', label: 'Уул уурхайн үйлчилгээ',
    labels: { mn: 'Уул уурхайн үйлчилгээ', en: 'Mining Support', zh: '矿业服务', ru: 'Горнодобывающие услуги' },
    icon: 'diamond-outline', color: '#967A54', sort_order: 11,
    has_rental_status: true, has_availability_dates: false, has_price: true, default_price_unit: 'PROJECT',
    subcategories: [
      { value: 'drilling_blasting', display: 'Өрөмдлөг, тэсэлгээ', labels: { mn: 'Өрөмдлөг, тэсэлгээ', en: 'Drilling & Blasting', zh: '钻爆作业', ru: 'Буровзрывные работы' } },
      { value: 'earthworks', display: 'Шороон ажил', labels: { mn: 'Шороон ажил', en: 'Earthworks', zh: '土方工程', ru: 'Земляные работы' } },
      { value: 'haulage', display: 'Уурхайн тээвэр', labels: { mn: 'Уурхайн тээвэр', en: 'Mine Haulage', zh: '矿山运输', ru: 'Карьерные перевозки' } },
      { value: 'camp_services', display: 'Кемпийн үйлчилгээ', labels: { mn: 'Кемпийн үйлчилгээ', en: 'Camp Services', zh: '营地服务', ru: 'Обслуживание лагерей' } },
      { value: 'maintenance', display: 'Техник засвар', labels: { mn: 'Техник засвар', en: 'Equipment Maintenance', zh: '设备维修', ru: 'Обслуживание техники' } },
    ],
    fields: [
      { key: 'experience_years', label: 'Туршлага (жил)', labels: { mn: 'Туршлага (жил)', en: 'Experience (years)', zh: '经验（年）', ru: 'Опыт (лет)' }, type: 'number', filterable: true },
      { key: 'certifications', label: 'Гэрчилгээ, стандарт', labels: { mn: 'Гэрчилгээ, стандарт', en: 'Certifications', zh: '认证标准', ru: 'Сертификаты' }, type: 'text' },
    ],
  },
  {
    key: 'winterservice', label: 'Өвлийн үйлчилгээ',
    labels: { mn: 'Өвлийн үйлчилгээ', en: 'Winter Services', zh: '冬季服务', ru: 'Зимние услуги' },
    icon: 'snow-outline', color: '#4C869E', sort_order: 12,
    has_rental_status: true, has_availability_dates: false, has_price: true, default_price_unit: 'PROJECT',
    subcategories: [
      { value: 'snow_removal', display: 'Цас цэвэрлэгээ', labels: { mn: 'Цас цэвэрлэгээ', en: 'Snow Removal', zh: '除雪', ru: 'Уборка снега' } },
      { value: 'ground_thawing', display: 'Хөрс гэсгээх', labels: { mn: 'Хөрс гэсгээх', en: 'Ground Thawing', zh: '土壤解冻', ru: 'Отогрев грунта' } },
      { value: 'heating_rental', display: 'Халаагуур түрээс', labels: { mn: 'Халаагуур түрээс', en: 'Heater Rental', zh: '取暖设备租赁', ru: 'Аренда обогревателей' } },
      { value: 'winterization', display: 'Өвөлжилтийн бэлтгэл', labels: { mn: 'Өвөлжилтийн бэлтгэл', en: 'Winterization', zh: '冬季防护', ru: 'Подготовка к зиме' } },
    ],
    fields: [
      { key: 'service_area', label: 'Үйлчлэх бүс', labels: { mn: 'Үйлчлэх бүс', en: 'Service area', zh: '服务区域', ru: 'Зона обслуживания' }, type: 'text', filterable: true },
      { key: 'operating_hours', label: 'Ажиллах цаг', labels: { mn: 'Ажиллах цаг', en: 'Operating hours', zh: '营业时间', ru: 'Время работы' }, type: 'text', placeholder: '24 цаг' },
    ],
  },
];

// Subcategory renames: [category, value, wrong mn, corrected display+labels.mn (+extra locale fixes)]
const SUB_RENAMES: Array<[string, string, string, string, Partial<Record<string, string>>?]> = [
  ['construction', 'plumbing', 'Дүүргэлтийн ажил', 'Сантехникийн ажил'],
  ['jobvacancy', 'plumber', 'Дүүргэлтийн', 'Сантехникч'],
  ['machineryrent', 'compactor', 'Тэгшлэгч', 'Нягтруулагч'],
  ['toolrent', 'scaffolding', 'Тулгуур', 'Барилгын шат'],
  ['vehiclerent', 'van', '货车', '面包车', { locale: 'zh' }],
];

const SUB_ADDITIONS: Record<string, Sub[]> = {
  machineryrent: [
    { value: 'forklift', display: 'Сэрээт өргөгч', labels: { mn: 'Сэрээт өргөгч', en: 'Forklift', zh: '叉车', ru: 'Вилочный погрузчик' } },
    { value: 'grader', display: 'Автогрейдер', labels: { mn: 'Автогрейдер', en: 'Grader', zh: '平地机', ru: 'Автогрейдер' } },
    { value: 'concrete_mixer', display: 'Бетон зуурагч', labels: { mn: 'Бетон зуурагч', en: 'Concrete Mixer', zh: '搅拌车', ru: 'Бетономешалка' } },
    { value: 'drilling_rig', display: 'Өрөмдлөгийн төхөөрөмж', labels: { mn: 'Өрөмдлөгийн төхөөрөмж', en: 'Drilling Rig', zh: '钻机', ru: 'Буровая установка' } },
  ],
  sos: [
    { value: 'fuel_delivery', display: 'Шатахуун хүргэлт', labels: { mn: 'Шатахуун хүргэлт', en: 'Fuel Delivery', zh: '送油服务', ru: 'Доставка топлива' } },
    { value: 'mobile_repair', display: 'Дуудлагын засвар', labels: { mn: 'Дуудлагын засвар', en: 'Mobile Repair', zh: '上门维修', ru: 'Выездной ремонт' } },
    { value: 'jump_start', display: 'Асаалт өгөх', labels: { mn: 'Асаалт өгөх', en: 'Jump Start', zh: '搭电启动', ru: 'Прикуривание АКБ' } },
  ],
};

const FIELD_ADDITIONS: Record<string, Field[]> = {
  construction: [
    { key: 'experience_years', label: 'Туршлага (жил)', labels: { mn: 'Туршлага (жил)', en: 'Experience (years)', zh: '经验（年）', ru: 'Опыт (лет)' }, type: 'number', filterable: true },
    { key: 'team_size', label: 'Ажилчдын тоо', labels: { mn: 'Ажилчдын тоо', en: 'Team size', zh: '团队规模', ru: 'Размер команды' }, type: 'number' },
  ],
};

// Field label fixes: applied to every category whose field still carries the old mn label
const FIELD_RENAMES: Array<[string, string, string]> = [
  ['manufactured_date', 'Үйлдвэрлэсэн огноо', 'Үйлдвэрлэсэн он'],
  ['imported_date', 'Импорт хийсэн огноо', 'Импортолсон он'],
];

export class CategoryExpansion1784333600000 implements MigrationInterface {
  name = 'CategoryExpansion1784333600000';

  private async loadRow(queryRunner: QueryRunner, key: string): Promise<Row | undefined> {
    const rows = await queryRunner.query(
      `SELECT "id", "subcategories", "fields" FROM "category_schema" WHERE "key" = $1`, [key],
    );
    return rows[0];
  }

  private async saveRow(queryRunner: QueryRunner, row: Row): Promise<void> {
    await queryRunner.query(
      `UPDATE "category_schema" SET "subcategories" = $1::jsonb, "fields" = $2::jsonb WHERE "id" = $3`,
      [JSON.stringify(row.subcategories ?? []), JSON.stringify(row.fields ?? []), row.id],
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const cat of NEW_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "category_schema"
           ("key","label","labels","icon","color","sort_order",
            "has_rental_status","has_availability_dates","has_price","default_price_unit",
            "subcategories","fields","active")
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,true)
         ON CONFLICT ("key") DO NOTHING`,
        [
          cat.key, cat.label, JSON.stringify(cat.labels), cat.icon, cat.color, cat.sort_order,
          cat.has_rental_status, cat.has_availability_dates, cat.has_price, cat.default_price_unit,
          JSON.stringify(cat.subcategories), JSON.stringify(cat.fields),
        ],
      );
    }
    await this.applyRenamesAndAdditions(queryRunner, 'up');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "category_schema" WHERE "key" = ANY($1)`,
      [NEW_CATEGORIES.map((c) => c.key)],
    );
    await this.applyRenamesAndAdditions(queryRunner, 'down');
  }

  // Shared walker: label fixes swap old↔new depending on direction; additions
  // are appended on up and removed on down. Admin-edited values never match
  // the "from" side, so they are left untouched in both directions.
  private async applyRenamesAndAdditions(queryRunner: QueryRunner, dir: 'up' | 'down'): Promise<void> {
    const keys = new Set<string>([
      ...SUB_RENAMES.map(([k]) => k),
      ...Object.keys(SUB_ADDITIONS),
      ...Object.keys(FIELD_ADDITIONS),
      'vehiclerent', 'machineryrent', 'toolrent',
    ]);

    for (const key of keys) {
      const row = await this.loadRow(queryRunner, key);
      if (!row) continue;

      for (const [cat, value, wrong, fixed, opts] of SUB_RENAMES) {
        if (cat !== key) continue;
        const locale = opts?.locale ?? 'mn';
        const [from, to] = dir === 'up' ? [wrong, fixed] : [fixed, wrong];
        const sub = (row.subcategories ?? []).find((s) => s.value === value);
        if (!sub || sub.labels?.[locale] !== from) continue;
        sub.labels[locale] = to;
        if (locale === 'mn' && sub.display === from) sub.display = to;
      }

      for (const [fieldKey, wrong, fixed] of FIELD_RENAMES) {
        const [from, to] = dir === 'up' ? [wrong, fixed] : [fixed, wrong];
        const field = (row.fields ?? []).find((f) => f.key === fieldKey) as
          (Field & { label?: string; labels?: Record<string, string> }) | undefined;
        if (!field || field.labels?.mn !== from) continue;
        field.labels.mn = to;
        if (field.label === from) field.label = to;
      }

      const addedSubs = SUB_ADDITIONS[key] ?? [];
      if (dir === 'up') {
        const existing = new Set((row.subcategories ?? []).map((s) => s.value));
        row.subcategories = [...(row.subcategories ?? []), ...addedSubs.filter((s) => !existing.has(s.value))];
      } else {
        const remove = new Set(addedSubs.map((s) => s.value));
        row.subcategories = (row.subcategories ?? []).filter((s) => !remove.has(s.value));
      }

      const addedFields = FIELD_ADDITIONS[key] ?? [];
      if (dir === 'up') {
        const existing = new Set((row.fields ?? []).map((f) => f.key));
        row.fields = [...(row.fields ?? []), ...addedFields.filter((f) => !existing.has(f.key))];
      } else {
        const remove = new Set(addedFields.map((f) => f.key));
        row.fields = (row.fields ?? []).filter((f) => !remove.has(f.key));
      }

      await this.saveRow(queryRunner, row);
    }
  }
}
