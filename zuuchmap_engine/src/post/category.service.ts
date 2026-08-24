import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorySchema, FieldDef } from './entities/category-schema.entity';
import { sharedCache, invalidateCategoryCaches } from '../utils/cache';

const CACHE_KEY = 'categories';
const CACHE_TTL = 60 * 60_000; // 1 h

// ─── Shared field library ─────────────────────────────────────────────────
// One key per concept across every category. `experience_years` means the same
// thing everywhere; credentials are always `license_no`. Core fields are
// required and render upfront; details are optional and sit behind a
// collapsible. Never introduce a synonym for a key defined here.

type Grp = 'core' | 'details';
const L = (mn: string, en: string, zh: string, ru: string) => ({ mn, en, zh, ru });

const identity = (pick: Array<'manufacturer' | 'model' | 'year'>, group: Grp = 'core'): FieldDef[] => {
  const all: Record<string, FieldDef> = {
    manufacturer: { key: 'manufacturer', label: 'Үйлдвэрлэгч/Брэнд', labels: L('Үйлдвэрлэгч/Брэнд', 'Manufacturer/Brand', '制造商/品牌', 'Производитель/Бренд'), type: 'text', required: group === 'core', group, filterable: true, placeholder: 'Komatsu' },
    model: { key: 'model', label: 'Загвар', labels: L('Загвар', 'Model', '型号', 'Модель'), type: 'text', required: group === 'core', group, placeholder: 'PC200-8' },
    year: { key: 'year', label: 'Үйлдвэрлэсэн он', labels: L('Үйлдвэрлэсэн он', 'Manufactured year', '生产年份', 'Год выпуска'), type: 'number', required: group === 'core', group, filterable: true, placeholder: '2020' },
  };
  return pick.map((k) => ({ ...all[k] }));
};

const capacity = (labels: Record<string, string>, unit: string, group: Grp = 'core', filterable = true): FieldDef =>
  ({ key: 'capacity', label: labels.mn, labels, type: 'number', required: group === 'core', group, filterable, unit });

const condition = (group: Grp = 'core'): FieldDef =>
  ({ key: 'condition', label: 'Нөхцөл байдал', labels: L('Нөхцөл байдал', 'Condition', '状况', 'Состояние'), type: 'select', required: group === 'core', group, filterable: group === 'core', options: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR'] });

const withOperator = (labels: Record<string, string>): FieldDef =>
  ({ key: 'with_operator', label: labels.mn, labels, type: 'boolean', required: true, group: 'core', filterable: true });

const delivery = (group: Grp = 'core'): FieldDef =>
  ({ key: 'delivery_available', label: 'Хүргэлттэй', labels: L('Хүргэлттэй', 'Delivery available', '提供配送', 'Есть доставка'), type: 'boolean', required: group === 'core', group });

// Dealer-market differentiators: how machinery rental actually segments
// (dry vs maintained hire; purchase option at end of contract). Detail fields,
// not browse filters — the ≤4-filters-per-category budget is already spent.
const maintenanceIncluded = (): FieldDef =>
  ({ key: 'maintenance_included', label: 'Засвар үйлчилгээтэй', labels: L('Засвар үйлчилгээтэй', 'Maintenance included', '含维护保养', 'С техобслуживанием'), type: 'boolean', required: false, group: 'details' });

const rentToBuy = (): FieldDef =>
  ({ key: 'rent_to_buy', label: 'Түрээслээд худалдан авах боломжтой', labels: L('Түрээслээд худалдан авах боломжтой', 'Rent-to-buy option', '可租转购', 'С правом выкупа'), type: 'boolean', required: false, group: 'details' });

const experience = (): FieldDef =>
  ({ key: 'experience_years', label: 'Туршлага (жил)', labels: L('Туршлага (жил)', 'Experience (years)', '经验（年）', 'Опыт (лет)'), type: 'number', required: true, group: 'core', filterable: true, placeholder: '5' });

const licenseNo = (group: Grp = 'core'): FieldDef =>
  ({ key: 'license_no', label: 'Тусгай зөвшөөрлийн дугаар', labels: L('Тусгай зөвшөөрлийн дугаар', 'Licence number', '许可证号', 'Номер лицензии'), type: 'text', required: group === 'core', group });

const hours = (group: Grp = 'core'): FieldDef =>
  ({ key: 'operating_hours', label: 'Ажиллах цаг', labels: L('Ажиллах цаг', 'Operating hours', '营业时间', 'Время работы'), type: 'select', required: group === 'core', group, filterable: group === 'core', options: ['H24', 'WEEKDAY_DAY', 'DAILY_DAY', 'BY_CALL'] });

const coverage = (group: Grp = 'core', filterable = true): FieldDef =>
  ({ key: 'coverage', label: 'Үйлчлэх хүрээ', labels: L('Үйлчлэх хүрээ', 'Coverage', '服务范围', 'Зона обслуживания'), type: 'select', required: group === 'core', group, filterable, options: ['CITY', 'PROVINCE', 'NATIONWIDE'] });

const responseTime = (group: Grp = 'core'): FieldDef =>
  ({ key: 'response_time_min', label: 'Хүрэлцэн ирэх хугацаа', labels: L('Хүрэлцэн ирэх хугацаа', 'Response time', '响应时间', 'Время реагирования'), type: 'number', required: group === 'core', group, filterable: group === 'core', unit: 'мин', placeholder: '30' });

const num = (key: string, labels: Record<string, string>, group: Grp, opts: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label: labels.mn, labels, type: 'number', required: group === 'core', group, ...opts });

const txt = (key: string, labels: Record<string, string>, group: Grp, opts: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label: labels.mn, labels, type: 'text', required: group === 'core', group, ...opts });

const bool = (key: string, labels: Record<string, string>, group: Grp, opts: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label: labels.mn, labels, type: 'boolean', required: group === 'core', group, ...opts });

const sel = (key: string, labels: Record<string, string>, options: string[], group: Grp, opts: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label: labels.mn, labels, type: 'select', required: group === 'core', group, options, ...opts });

const rentalFlags = { has_rental_status: true, has_availability_dates: true, has_price: true, default_price_unit: 'DAY' };
const serviceFlags = { has_rental_status: true, has_price: true, default_price_unit: 'PROJECT' };

/**
 * The 13 category schemas. Exported so the redesign migration can write the
 * same definitions into an existing database — `seedCategories()` early-returns
 * on a non-empty table and therefore cannot upgrade a live environment.
 */
export const CATEGORY_SEED: Partial<CategorySchema>[] = [
  {
    key: 'vehiclerent', label: 'Тээврийн хэрэгсэл',
    labels: L('Тээврийн хэрэгсэл', 'Vehicle Rental', '车辆租赁', 'Аренда транспорта'),
    icon: 'car-outline', color: '#558D39', sort_order: 0, ...rentalFlags,
    subcategories: [
      { value: 'car', display: 'Суудлын машин', labels: L('Суудлын машин', 'Car', '轿车', 'Легковой автомобиль') },
      { value: 'suv', display: 'Жийп', labels: L('Жийп', 'SUV', 'SUV', 'Внедорожник') },
      { value: 'truck', display: 'Ачааны машин', labels: L('Ачааны машин', 'Truck', '卡车', 'Грузовик') },
      { value: 'bus', display: 'Автобус', labels: L('Автобус', 'Bus', '客车', 'Автобус') },
      { value: 'van', display: 'Микроавтобус', labels: L('Микроавтобус', 'Van', '面包车', 'Микроавтобус') },
    ],
    fields: [
      ...identity(['manufacturer', 'model', 'year']),
      withOperator(L('Жолоочтой', 'With driver', '含司机', 'С водителем')),
      sel('fuel_type', L('Шатахуун', 'Fuel type', '燃料类型', 'Тип топлива'), ['PETROL', 'DIESEL', 'GAS', 'ELECTRIC'], 'details'),
      num('seats', L('Суудлын тоо', 'Seats', '座位数', 'Мест'), 'details', { placeholder: '4' }),
      rentToBuy(),
    ],
  },
  {
    key: 'machineryrent', label: 'Машин техник',
    labels: L('Машин техник', 'Machinery Rental', '机械租赁', 'Аренда техники'),
    icon: 'construct-outline', color: '#6A7BC2', sort_order: 1,
    ...rentalFlags, default_price_unit: 'MOTO_HOUR',
    subcategories: [
      { value: 'crane', display: 'Кран', labels: L('Кран', 'Crane', '起重机', 'Кран') },
      { value: 'excavator', display: 'Экскаватор', labels: L('Экскаватор', 'Excavator', '挖掘机', 'Экскаватор') },
      { value: 'bulldozer', display: 'Бульдозер', labels: L('Бульдозер', 'Bulldozer', '推土机', 'Бульдозер') },
      { value: 'loader', display: 'Ачигч', labels: L('Ачигч', 'Loader', '装载机', 'Погрузчик') },
      { value: 'compactor', display: 'Нягтруулагч', labels: L('Нягтруулагч', 'Compactor', '压实机', 'Уплотнитель') },
      { value: 'forklift', display: 'Сэрээт өргөгч', labels: L('Сэрээт өргөгч', 'Forklift', '叉车', 'Вилочный погрузчик') },
      { value: 'grader', display: 'Автогрейдер', labels: L('Автогрейдер', 'Grader', '平地机', 'Автогрейдер') },
      { value: 'concrete_mixer', display: 'Бетон зуурагч', labels: L('Бетон зуурагч', 'Concrete Mixer', '混凝土搅拌机', 'Бетономешалка') },
      { value: 'drilling_rig', display: 'Өрөмдлөгийн төхөөрөмж', labels: L('Өрөмдлөгийн төхөөрөмж', 'Drilling Rig', '钻机', 'Буровая установка') },
    ],
    fields: [
      ...identity(['manufacturer', 'model', 'year']),
      capacity(L('Даац / хүчин чадал', 'Capacity', '承载能力', 'Грузоподъёмность'), 'т'),
      withOperator(L('Операторчтой', 'Operator included', '含操作员', 'С оператором')),
      delivery('details'),
      num('min_rental_days', L('Хамгийн бага түрээсийн хоног', 'Minimum rental days', '最少租赁天数', 'Мин. срок аренды'), 'details', { placeholder: '3' }),
      num('min_moto_hours_per_day', L('Өдрийн доод мото цаг', 'Minimum engine hours per day', '每日最少工时', 'Мин. моточасов в день'), 'details', { placeholder: '8', unit: 'мото цаг' }),
      maintenanceIncluded(),
      rentToBuy(),
    ],
  },
  {
    key: 'toolrent', label: 'Багаж хэрэгсэл',
    labels: L('Багаж хэрэгсэл', 'Tool Rental', '工具租赁', 'Аренда инструментов'),
    icon: 'hammer-outline', color: '#976CC3', sort_order: 2, ...rentalFlags,
    subcategories: [
      { value: 'power_tools', display: 'Цахилгаан багаж', labels: L('Цахилгаан багаж', 'Power Tools', '电动工具', 'Электроинструменты') },
      { value: 'formwork', display: 'Хэв', labels: L('Хэв', 'Formwork', '模板', 'Опалубка') },
      { value: 'scaffolding', display: 'Барилгын шат', labels: L('Барилгын шат', 'Scaffolding', '脚手架', 'Строительные леса') },
      { value: 'measuring', display: 'Хэмжих багаж', labels: L('Хэмжих багаж', 'Measuring Tools', '测量工具', 'Измерительные приборы') },
    ],
    fields: [
      ...identity(['manufacturer']),
      num('quantity_available', L('Боломжит тоо ширхэг', 'Quantity available', '可用数量', 'Доступное количество'), 'core', { filterable: true, placeholder: '10' }),
      ...identity(['model'], 'details'),
      condition('details'),
      delivery('details'),
    ],
  },
  {
    key: 'materialstore', label: 'Барилгын материал',
    labels: L('Барилгын материал', 'Building Materials', '建筑材料', 'Стройматериалы'),
    icon: 'layers-outline', color: '#848236', sort_order: 3, has_price: true, default_price_unit: 'UNIT',
    subcategories: [
      { value: 'cement', display: 'Цемент', labels: L('Цемент', 'Cement', '水泥', 'Цемент') },
      { value: 'aggregate', display: 'Хайрга, элс', labels: L('Хайрга, элс', 'Aggregate', '砂石', 'Щебень, песок') },
      { value: 'rebar', display: 'Арматур, металл', labels: L('Арматур, металл', 'Rebar & metal', '钢筋、金属', 'Арматура, металл') },
      { value: 'timber', display: 'Мод материал', labels: L('Мод материал', 'Timber', '木材', 'Пиломатериалы') },
      { value: 'insulation', display: 'Дулаалга', labels: L('Дулаалга', 'Insulation', '保温材料', 'Утеплитель') },
      { value: 'brick_block', display: 'Тоосго, блок', labels: L('Тоосго, блок', 'Brick & block', '砖块', 'Кирпич, блок') },
      { value: 'roofing', display: 'Дээврийн материал', labels: L('Дээврийн материал', 'Roofing', '屋顶材料', 'Кровля') },
      { value: 'finishing', display: 'Заслын материал', labels: L('Заслын материал', 'Finishing', '装饰材料', 'Отделка') },
      { value: 'plumbing_electrical', display: 'Сантехник, цахилгаан', labels: L('Сантехник, цахилгаан', 'Plumbing & electrical', '水暖电气', 'Сантехника, электрика') },
      { value: 'other', display: 'Бусад', labels: L('Бусад', 'Other', '其他', 'Прочее') },
    ],
    fields: [
      sel('sale_type', L('Худалдааны төрөл', 'Sale type', '销售类型', 'Тип продажи'), ['WHOLESALE', 'RETAIL', 'BOTH'], 'core', { filterable: true }),
      delivery('core'),
      hours('core'),
      txt('min_order', L('Хамгийн бага захиалга', 'Minimum order', '最小订单', 'Мин. заказ'), 'details', { placeholder: '1 тонн' }),
    ],
  },
  {
    key: 'construction', label: 'Барилгын үйлчилгээ',
    labels: L('Барилгын үйлчилгээ', 'Construction Services', '建筑服务', 'Строительные услуги'),
    icon: 'business-outline', color: '#3D8995', sort_order: 4, ...serviceFlags,
    subcategories: [
      { value: 'general', display: 'Ерөнхий барилга', labels: L('Ерөнхий барилга', 'General Construction', '综合施工', 'Общестроительные') },
      { value: 'interior', display: 'Интерьер засал', labels: L('Интерьер засал', 'Interior Finishing', '室内装修', 'Внутренняя отделка') },
      { value: 'exterior', display: 'Гадна засал', labels: L('Гадна засал', 'Exterior Finishing', '外墙装修', 'Наружная отделка') },
      { value: 'electrical', display: 'Цахилгааны ажил', labels: L('Цахилгааны ажил', 'Electrical Work', '电气工程', 'Электромонтаж') },
      { value: 'plumbing', display: 'Сантехникийн ажил', labels: L('Сантехникийн ажил', 'Plumbing', '管道工程', 'Сантехника') },
      { value: 'roofing', display: 'Дээвэр', labels: L('Дээвэр', 'Roofing', '屋顶工程', 'Кровля') },
      { value: 'flooring', display: 'Шал', labels: L('Шал', 'Flooring', '地板工程', 'Полы') },
      { value: 'painting', display: 'Будгийн ажил', labels: L('Будгийн ажил', 'Painting', '油漆工程', 'Малярные работы') },
    ],
    fields: [
      experience(),
      num('team_size', L('Багийн бүрэлдэхүүн', 'Team size', '团队规模', 'Размер бригады'), 'core', { placeholder: '8' }),
      bool('with_materials', L('Материалтай эсэх', 'Materials included', '含材料', 'С материалами'), 'core', { filterable: true }),
      licenseNo('details'),
      num('warranty_months', L('Баталгаат хугацаа (сар)', 'Warranty (months)', '保修期（月）', 'Гарантия (мес.)'), 'details', { placeholder: '12' }),
    ],
  },
  {
    key: 'jobvacancy', label: 'Ажлын байр',
    labels: L('Ажлын байр', 'Job Vacancy', '招聘', 'Вакансии'),
    icon: 'briefcase-outline', color: '#BC5CA9', sort_order: 5,
    subcategories: [
      { value: 'engineer', display: 'Инженер', labels: L('Инженер', 'Engineer', '工程师', 'Инженер') },
      { value: 'worker', display: 'Ажилчин', labels: L('Ажилчин', 'Worker', '工人', 'Рабочий') },
      { value: 'driver', display: 'Жолооч', labels: L('Жолооч', 'Driver', '司机', 'Водитель') },
      { value: 'welder', display: 'Гагнуурчин', labels: L('Гагнуурчин', 'Welder', '焊工', 'Сварщик') },
      { value: 'electrician', display: 'Цахилгаанчин', labels: L('Цахилгаанчин', 'Electrician', '电工', 'Электрик') },
      { value: 'plumber', display: 'Сантехникч', labels: L('Сантехникч', 'Plumber', '管道工', 'Сантехник') },
      { value: 'manager', display: 'Менежер', labels: L('Менежер', 'Manager', '经理', 'Менеджер') },
      { value: 'accountant', display: 'Нягтлан бодогч', labels: L('Нягтлан бодогч', 'Accountant', '会计', 'Бухгалтер') },
    ],
    fields: [
      sel('employment_type', L('Ажлын төрөл', 'Employment type', '雇佣类型', 'Тип занятости'), ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE'], 'core', { filterable: true }),
      num('salary_min', L('Цалин, доод', 'Salary from', '最低薪资', 'Зарплата от'), 'core', { filterable: true, unit: '₮', placeholder: '800000' }),
      num('salary_max', L('Цалин, дээд', 'Salary to', '最高薪资', 'Зарплата до'), 'core', { unit: '₮', placeholder: '1200000' }),
      experience(),
      bool('accommodation_provided', L('Байр, хоолтой', 'Accommodation provided', '提供食宿', 'С проживанием'), 'core', { filterable: true }),
      num('positions', L('Ажлын байрны тоо', 'Positions', '招聘人数', 'Количество мест'), 'details', { placeholder: '3' }),
    ],
  },
  {
    key: 'factory', label: 'Үйлдвэр',
    labels: L('Үйлдвэр', 'Factory', '工厂', 'Завод'),
    icon: 'storefront-outline', color: '#3A8E5C', sort_order: 6, has_price: true, default_price_unit: 'UNIT',
    subcategories: [
      { value: 'concrete', display: 'Бетон бүтээгдэхүүн', labels: L('Бетон бүтээгдэхүүн', 'Concrete Products', '混凝土制品', 'Бетонные изделия') },
      { value: 'metal', display: 'Металл бүтээгдэхүүн', labels: L('Металл бүтээгдэхүүн', 'Metal Products', '金属制品', 'Металлоизделия') },
      { value: 'wood', display: 'Мод бүтээгдэхүүн', labels: L('Мод бүтээгдэхүүн', 'Wood Products', '木制品', 'Деревянные изделия') },
      { value: 'brick', display: 'Тоосго', labels: L('Тоосго', 'Brick', '砖', 'Кирпич') },
      { value: 'glass', display: 'Шил', labels: L('Шил', 'Glass', '玻璃', 'Стекло') },
      { value: 'door_window', display: 'Хаалга, цонх', labels: L('Хаалга, цонх', 'Doors & Windows', '门窗', 'Двери и окна') },
    ],
    fields: [
      capacity(L('Өдрийн хүчин чадал', 'Daily capacity', '日产能', 'Суточная мощность'), 'нэгж/өдөр'),
      hours('core'),
      delivery('core'),
      txt('min_order', L('Хамгийн бага захиалга', 'Minimum order', '最小订单', 'Мин. заказ'), 'details', { placeholder: '100 ш' }),
      licenseNo('details'),
    ],
  },
  {
    key: 'sos', label: 'SOS Үйлчилгээ',
    labels: L('SOS Үйлчилгээ', 'SOS Services', '紧急服务', 'SOS услуги'),
    icon: 'warning-outline', color: '#D25562', sort_order: 7,
    has_rental_status: true, has_price: true, default_price_unit: 'TRIP', emphasized: true,
    subcategories: [
      { value: 'tire_repair', display: 'Дугуй засвар', labels: L('Дугуй засвар', 'Tire Repair', '轮胎维修', 'Ремонт шин') },
      { value: 'towing', display: 'Чирэлт', labels: L('Чирэлт', 'Towing', '拖车', 'Эвакуатор') },
      { value: 'battery', display: 'Аккумулятор', labels: L('Аккумулятор', 'Battery Service', '电池服务', 'Аккумулятор') },
      { value: 'fuel_delivery', display: 'Шатахуун хүргэлт', labels: L('Шатахуун хүргэлт', 'Fuel Delivery', '燃油配送', 'Доставка топлива') },
      { value: 'mobile_repair', display: 'Дуудлагын засвар', labels: L('Дуудлагын засвар', 'Mobile Repair', '上门维修', 'Выездной ремонт') },
      { value: 'jump_start', display: 'Асаалт өгөх', labels: L('Асаалт өгөх', 'Jump Start', '搭电启动', 'Прикуривание') },
    ],
    fields: [responseTime('core'), coverage('core'), hours('core')],
  },
  {
    key: 'usedequipment', label: 'Худалдах техник',
    labels: L('Худалдах техник', 'Used Equipment', '二手设备', 'Техника б/у'),
    icon: 'pricetags-outline', color: '#C16546', sort_order: 8, has_price: true, default_price_unit: 'TOTAL',
    subcategories: [
      { value: 'vehicle', display: 'Тээврийн хэрэгсэл', labels: L('Тээврийн хэрэгсэл', 'Vehicles', '车辆', 'Транспорт') },
      { value: 'machinery', display: 'Машин техник', labels: L('Машин техник', 'Machinery', '机械', 'Техника') },
      { value: 'tools', display: 'Багаж хэрэгсэл', labels: L('Багаж хэрэгсэл', 'Tools', '工具', 'Инструменты') },
      { value: 'spare_parts', display: 'Сэлбэг', labels: L('Сэлбэг', 'Spare Parts', '配件', 'Запчасти') },
    ],
    fields: [
      ...identity(['manufacturer', 'model', 'year']),
      condition('core'),
      num('mileage_km', L('Гүйлт', 'Mileage', '里程', 'Пробег'), 'details', { unit: 'км', placeholder: '120000' }),
      num('moto_hours', L('Мото цаг', 'Engine hours', '发动机小时', 'Моточасы'), 'details', { unit: 'мото цаг', placeholder: '4500' }),
      bool('negotiable', L('Үнэ тохирно', 'Price negotiable', '价格可议', 'Торг уместен'), 'details'),
    ],
  },
  {
    key: 'transport', label: 'Тээвэр, ачаа',
    labels: L('Тээвэр, ачаа', 'Transport & Freight', '运输货运', 'Транспорт и грузы'),
    icon: 'bus-outline', color: '#4984B4', sort_order: 9,
    has_rental_status: true, has_price: true, default_price_unit: 'TRIP',
    subcategories: [
      { value: 'freight', display: 'Ачаа тээвэр', labels: L('Ачаа тээвэр', 'Freight', '货运', 'Грузоперевозки') },
      { value: 'dump_truck', display: 'Самосвал', labels: L('Самосвал', 'Dump Truck', '自卸车', 'Самосвал') },
      { value: 'crane_service', display: 'Крантай үйлчилгээ', labels: L('Крантай үйлчилгээ', 'Crane Service', '吊车服务', 'Услуги крана') },
      { value: 'heavy_haul', display: 'Хүнд даацын тээвэр', labels: L('Хүнд даацын тээвэр', 'Heavy Haul', '重型运输', 'Тяжеловесы') },
      { value: 'water_delivery', display: 'Ус хүргэлт', labels: L('Ус хүргэлт', 'Water Delivery', '送水', 'Доставка воды') },
    ],
    fields: [
      capacity(L('Даац', 'Capacity', '载重', 'Грузоподъёмность'), 'т'),
      coverage('core'),
      bool('loading_included', L('Ачилт багтсан', 'Loading included', '含装卸', 'Погрузка включена'), 'details'),
      num('vehicle_count', L('Тээврийн хэрэгслийн тоо', 'Vehicle count', '车辆数量', 'Количество машин'), 'details', { placeholder: '2' }),
    ],
  },
  {
    key: 'designservice', label: 'Зураг төсөл, инженеринг',
    labels: L('Зураг төсөл, инженеринг', 'Design & Engineering', '设计与工程', 'Проектирование'),
    icon: 'compass-outline', color: '#8473C3', sort_order: 10, ...serviceFlags,
    subcategories: [
      { value: 'architecture', display: 'Архитектур', labels: L('Архитектур', 'Architecture', '建筑设计', 'Архитектура') },
      { value: 'structural', display: 'Бүтээцийн инженер', labels: L('Бүтээцийн инженер', 'Structural Engineering', '结构工程', 'Конструкции') },
      { value: 'surveying', display: 'Геодези, хэмжилт', labels: L('Геодези, хэмжилт', 'Surveying', '测绘', 'Геодезия') },
      { value: 'soil_testing', display: 'Хөрсний шинжилгээ', labels: L('Хөрсний шинжилгээ', 'Soil Testing', '土壤测试', 'Исследование грунта') },
      { value: 'permits', display: 'Зөвшөөрөл, баримт бичиг', labels: L('Зөвшөөрөл, баримт бичиг', 'Permits & Documentation', '许可与文件', 'Разрешения') },
      { value: 'interior_design', display: 'Интерьер дизайн', labels: L('Интерьер дизайн', 'Interior Design', '室内设计', 'Дизайн интерьера') },
    ],
    fields: [
      experience(),
      licenseNo('core'),
      num('delivery_days', L('Гүйцэтгэх хугацаа (хоног)', 'Delivery time (days)', '交付时间（天）', 'Срок выполнения (дн.)'), 'core', { filterable: true, placeholder: '14' }),
      num('project_count', L('Хийсэн төслийн тоо', 'Completed projects', '完成项目数', 'Выполнено проектов'), 'details', { placeholder: '25' }),
    ],
  },
  {
    key: 'miningsupport', label: 'Уул уурхайн үйлчилгээ',
    labels: L('Уул уурхайн үйлчилгээ', 'Mining Support', '矿业服务', 'Горные услуги'),
    icon: 'diamond-outline', color: '#967A54', sort_order: 11,
    ...serviceFlags, default_price_unit: 'MOTO_HOUR',
    subcategories: [
      { value: 'drilling_blasting', display: 'Өрөмдлөг, тэсэлгээ', labels: L('Өрөмдлөг, тэсэлгээ', 'Drilling & Blasting', '钻孔爆破', 'Бурение и взрывные') },
      { value: 'earthworks', display: 'Шороон ажил', labels: L('Шороон ажил', 'Earthworks', '土方工程', 'Земляные работы') },
      { value: 'haulage', display: 'Уурхайн тээвэр', labels: L('Уурхайн тээвэр', 'Mine Haulage', '矿山运输', 'Рудничный транспорт') },
      { value: 'camp_services', display: 'Кемпийн үйлчилгээ', labels: L('Кемпийн үйлчилгээ', 'Camp Services', '营地服务', 'Услуги лагеря') },
      { value: 'maintenance', display: 'Техник засвар', labels: L('Техник засвар', 'Equipment Maintenance', '设备维护', 'Обслуживание техники') },
    ],
    fields: [
      experience(),
      licenseNo('core'),
      num('crew_size', L('Багийн бүрэлдэхүүн', 'Crew size', '班组人数', 'Численность бригады'), 'core', { placeholder: '12' }),
      coverage('details', false),
      bool('equipment_owned', L('Өөрийн техниктэй', 'Owns equipment', '自有设备', 'Своя техника'), 'details'),
    ],
  },
  {
    key: 'winterservice', label: 'Өвлийн үйлчилгээ',
    labels: L('Өвлийн үйлчилгээ', 'Winter Services', '冬季服务', 'Зимние услуги'),
    icon: 'snow-outline', color: '#4C869E', sort_order: 12, ...serviceFlags,
    subcategories: [
      { value: 'snow_removal', display: 'Цас цэвэрлэгээ', labels: L('Цас цэвэрлэгээ', 'Snow Removal', '除雪', 'Уборка снега') },
      { value: 'ground_thawing', display: 'Хөрс гэсгээх', labels: L('Хөрс гэсгээх', 'Ground Thawing', '土壤解冻', 'Прогрев грунта') },
      { value: 'heating_rental', display: 'Халаагуур түрээс', labels: L('Халаагуур түрээс', 'Heater Rental', '加热器租赁', 'Аренда обогревателей') },
      { value: 'winterization', display: 'Өвөлжилтийн бэлтгэл', labels: L('Өвөлжилтийн бэлтгэл', 'Winterization', '冬季准备', 'Подготовка к зиме') },
    ],
    fields: [
      coverage('core'),
      hours('core'),
      responseTime('details'),
      bool('equipment_owned', L('Өөрийн техниктэй', 'Owns equipment', '自有设备', 'Своя техника'), 'details'),
    ],
  },
];

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);
  private readonly cache = sharedCache;

  constructor(
    @InjectRepository(CategorySchema)
    private readonly categoryRepository: Repository<CategorySchema>,
  ) {}

  async getCategories(): Promise<CategorySchema[]> {
    const cached = this.cache.get<CategorySchema[]>(CACHE_KEY);
    if (cached) return cached;

    const result = await this.categoryRepository.find({
      where: { active: true },
      order: { sort_order: 'ASC' },
    });
    this.cache.set(CACHE_KEY, result, CACHE_TTL);
    return result;
  }

  // Cached: this sits on the hot post-create and booking paths, which used
  // to hit the DB per request while the list variant was cached for an hour.
  async getCategory(key: string): Promise<CategorySchema> {
    const cacheKey = `category:${key}`;
    const cached = this.cache.get<CategorySchema>(cacheKey);
    if (cached) return cached;
    const cat = await this.categoryRepository.findOne({ where: { key } });
    if (!cat) throw new NotFoundException(`Category '${key}' not found`);
    this.cache.set(cacheKey, cat, CACHE_TTL);
    return cat;
  }

  async getAllCategoriesForAdmin(): Promise<CategorySchema[]> {
    return this.categoryRepository.find({ order: { sort_order: 'ASC' } });
  }

  private static readonly FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone'];
  // Post column names — schema attribute keys must not shadow them
  private static readonly RESERVED_FIELD_KEYS = [
    'id', 'category', 'subcategory', 'title', 'details', 'province', 'district',
    'address', 'latitude', 'longitude', 'location', 'price_amount', 'price_unit',
    'contact_phone', 'contact_email', 'available_from', 'available_until', 'website',
    'images', 'attributes', 'views', 'status', 'approval_status', 'rejection_reason',
    'expires_at', 'user', 'date_created', 'date_updated', 'search_vector',
  ];

  validateCategoryData(data: Partial<CategorySchema>): void {
    const seen = new Set<string>();
    for (const f of data.fields ?? []) {
      if (!/^[a-z0-9_]+$/.test(f.key ?? '')) {
        throw new BadRequestException(`Invalid field key '${f.key}' — use snake_case (a-z, 0-9, _)`);
      }
      if (CategoryService.RESERVED_FIELD_KEYS.includes(f.key)) {
        throw new BadRequestException(`Field key '${f.key}' is reserved — it collides with a built-in post column`);
      }
      if (seen.has(f.key)) throw new BadRequestException(`Duplicate field key '${f.key}'`);
      seen.add(f.key);
      if (!CategoryService.FIELD_TYPES.includes(f.type)) {
        throw new BadRequestException(`Invalid field type '${f.type}' for '${f.key}'`);
      }
      if ((f.type === 'select' || f.type === 'multiselect') && !(Array.isArray(f.options) && f.options.length > 0)) {
        throw new BadRequestException(`${f.type === 'select' ? 'Select' : 'Multiselect'} field '${f.key}' requires at least one option`);
      }
      if (f.group !== undefined && f.group !== 'core' && f.group !== 'details') {
        throw new BadRequestException(`Invalid group '${f.group}' for '${f.key}' — use 'core' or 'details'`);
      }
      // A required field hidden behind the details collapsible can never be
      // answered, so the post could not be submitted at all.
      if (f.required && f.group === 'details') {
        throw new BadRequestException(`Field '${f.key}' cannot be required and in the 'details' group`);
      }
    }
    const subSeen = new Set<string>();
    for (const s of data.subcategories ?? []) {
      if (!/^[a-z0-9_]+$/.test(s.value ?? '')) {
        throw new BadRequestException(`Invalid subcategory value '${s.value}' — use snake_case (a-z, 0-9, _)`);
      }
      if (subSeen.has(s.value)) throw new BadRequestException(`Duplicate subcategory value '${s.value}'`);
      subSeen.add(s.value);
    }

    // The key ends up in URLs (?category=…), i18n lookups and client caches, so
    // it has to survive all three unescaped. Only checked when present —
    // PATCH bodies are partial, and an existing key can never be renamed.
    if (data.key !== undefined && !/^[a-z0-9_]+$/.test(data.key)) {
      throw new BadRequestException(`Invalid category key '${data.key}' — use snake_case (a-z, 0-9, _)`);
    }

    // Mobile renders this through Ionicons, which needs a glyph name such as
    // 'car-outline'. An emoji here silently produces a blank marker.
    if (data.icon && !/^[a-z0-9-]+$/.test(data.icon)) {
      throw new BadRequestException(
        `Invalid icon '${data.icon}' — use an Ionicons name such as 'car-outline', not an emoji`,
      );
    }

    // Hex colour, so the app and web can both use it as a literal fill.
    if (data.color && !/^#[0-9a-fA-F]{6}$/.test(data.color)) {
      throw new BadRequestException(`Invalid colour '${data.color}' — use a 6-digit hex such as #4CAF50`);
    }

    if (data.post_expiry_days !== undefined && data.post_expiry_days !== null) {
      const d = data.post_expiry_days;
      if (!Number.isInteger(d) || d < 1 || d > 365) {
        throw new BadRequestException(`Invalid post_expiry_days '${d}' — use a whole number of days between 1 and 365`);
      }
    }
  }

  async createCategory(data: Partial<CategorySchema>): Promise<CategorySchema> {
    this.validateCategoryData(data);
    if (!data.key) throw new BadRequestException('Category key is required');
    const existing = await this.categoryRepository.findOne({ where: { key: data.key } });
    if (existing) throw new ConflictException(`Category key '${data.key}' already exists`);
    const cat = this.categoryRepository.create(data);
    const saved = await this.categoryRepository.save(cat);
    invalidateCategoryCaches();
    return saved;
  }

  async updateCategory(key: string, data: Partial<CategorySchema>): Promise<CategorySchema> {
    this.validateCategoryData(data);
    const cat = await this.getCategory(key);
    Object.assign(cat, data);
    const saved = await this.categoryRepository.save(cat);
    invalidateCategoryCaches();
    return saved;
  }

  async seedCategories(): Promise<void> {
    const existing = await this.categoryRepository.count();
    if (existing > 0) return;

    await this.categoryRepository.save(
      CATEGORY_SEED.map((cat) => this.categoryRepository.create(cat)),
    );
    this.logger.log('Category schemas seeded.');
  }
}
