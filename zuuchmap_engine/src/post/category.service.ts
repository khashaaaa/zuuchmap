import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorySchema, FieldDef } from './entities/category-schema.entity';
import { SimpleCache } from '../utils/cache';

const CACHE_KEY = 'categories';
const CACHE_TTL = 60 * 60_000; // 1 h

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);
  private readonly cache = new SimpleCache();

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

  async getCategory(key: string): Promise<CategorySchema> {
    const cat = await this.categoryRepository.findOne({ where: { key } });
    if (!cat) throw new NotFoundException(`Category '${key}' not found`);
    return cat;
  }

  async getAllCategoriesForAdmin(): Promise<CategorySchema[]> {
    return this.categoryRepository.find({ order: { sort_order: 'ASC' } });
  }

  private static readonly FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'date', 'phone'];
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
      if (f.type === 'select' && !(Array.isArray(f.options) && f.options.length > 0)) {
        throw new BadRequestException(`Select field '${f.key}' requires at least one option`);
      }
    }
    const subSeen = new Set<string>();
    for (const s of data.subcategories ?? []) {
      if (subSeen.has(s.value)) throw new BadRequestException(`Duplicate subcategory value '${s.value}'`);
      subSeen.add(s.value);
    }
  }

  async createCategory(data: Partial<CategorySchema>): Promise<CategorySchema> {
    this.validateCategoryData(data);
    if (!data.key) throw new BadRequestException('Category key is required');
    const existing = await this.categoryRepository.findOne({ where: { key: data.key } });
    if (existing) throw new ConflictException(`Category key '${data.key}' already exists`);
    const cat = this.categoryRepository.create(data);
    const saved = await this.categoryRepository.save(cat);
    this.cache.del(CACHE_KEY);
    return saved;
  }

  async updateCategory(key: string, data: Partial<CategorySchema>): Promise<CategorySchema> {
    this.validateCategoryData(data);
    const cat = await this.getCategory(key);
    Object.assign(cat, data);
    const saved = await this.categoryRepository.save(cat);
    this.cache.del(CACHE_KEY);
    return saved;
  }

  async seedCategories(): Promise<void> {
    const existing = await this.categoryRepository.count();
    if (existing > 0) return;

    const rentalFields = (yearFrom: string, yearTo?: string): FieldDef[] => [
      { key: 'manufacturer', label: 'Үйлдвэрлэгч/Брэнд', labels: { mn: 'Үйлдвэрлэгч/Брэнд', en: 'Manufacturer/Brand', zh: '制造商/品牌', ru: 'Производитель/Бренд' }, type: 'text', filterable: true },
      { key: 'model', label: 'Загвар', labels: { mn: 'Загвар', en: 'Model', zh: '型号', ru: 'Модель' }, type: 'text', filterable: true },
      { key: 'manufactured_date', label: 'Үйлдвэрлэсэн огноо', labels: { mn: 'Үйлдвэрлэсэн огноо', en: 'Manufactured year', zh: '生产年份', ru: 'Год выпуска' }, type: 'text', placeholder: yearFrom },
      ...(yearTo ? [{ key: 'imported_date', label: 'Импорт хийсэн огноо', labels: { mn: 'Импорт хийсэн огноо', en: 'Imported year', zh: '进口年份', ru: 'Год ввоза' }, type: 'text' as const, placeholder: yearTo }] : []),
    ];
    const hoursField = (placeholder: string): FieldDef => (
      { key: 'operating_hours', label: 'Ажиллах цаг', labels: { mn: 'Ажиллах цаг', en: 'Operating hours', zh: '营业时间', ru: 'Время работы' }, type: 'text', placeholder }
    );
    const rentalFlags = {
      has_rental_status: true, has_availability_dates: true, has_price: true, default_price_unit: 'DAY',
    };

    const categories: Partial<CategorySchema>[] = [
      {
        key: 'vehiclerent', label: 'Тээврийн хэрэгсэл',
        labels: { mn: 'Тээврийн хэрэгсэл', en: 'Vehicle Rental', zh: '车辆租赁', ru: 'Аренда транспорта' },
        icon: 'car-outline', color: '#4CAF50', sort_order: 0, ...rentalFlags,
        subcategories: [
          { value: 'car', display: 'Суудлын машин', labels: { mn: 'Суудлын машин', en: 'Car', zh: '轿车', ru: 'Легковой автомобиль' } },
          { value: 'suv', display: 'Жийп', labels: { mn: 'Жийп', en: 'SUV', zh: 'SUV', ru: 'Внедорожник' } },
          { value: 'truck', display: 'Ачааны машин', labels: { mn: 'Ачааны машин', en: 'Truck', zh: '卡车', ru: 'Грузовик' } },
          { value: 'bus', display: 'Автобус', labels: { mn: 'Автобус', en: 'Bus', zh: '客车', ru: 'Автобус' } },
          { value: 'van', display: 'Микроавтобус', labels: { mn: 'Микроавтобус', en: 'Van', zh: '货车', ru: 'Микроавтобус' } },
        ],
        fields: rentalFields('2020', '2021'),
      },
      {
        key: 'machineryrent', label: 'Машин техник',
        labels: { mn: 'Машин техник', en: 'Machinery Rental', zh: '机械租赁', ru: 'Аренда техники' },
        icon: 'construct-outline', color: '#FF9800', sort_order: 1, ...rentalFlags,
        subcategories: [
          { value: 'crane', display: 'Кран', labels: { mn: 'Кран', en: 'Crane', zh: '起重机', ru: 'Кран' } },
          { value: 'excavator', display: 'Экскаватор', labels: { mn: 'Экскаватор', en: 'Excavator', zh: '挖掘机', ru: 'Экскаватор' } },
          { value: 'bulldozer', display: 'Бульдозер', labels: { mn: 'Бульдозер', en: 'Bulldozer', zh: '推土机', ru: 'Бульдозер' } },
          { value: 'loader', display: 'Ачигч', labels: { mn: 'Ачигч', en: 'Loader', zh: '装载机', ru: 'Погрузчик' } },
          { value: 'compactor', display: 'Тэгшлэгч', labels: { mn: 'Тэгшлэгч', en: 'Compactor', zh: '压实机', ru: 'Уплотнитель' } },
        ],
        fields: rentalFields('2018', '2019'),
      },
      {
        key: 'toolrent', label: 'Багаж хэрэгсэл',
        labels: { mn: 'Багаж хэрэгсэл', en: 'Tool Rental', zh: '工具租赁', ru: 'Аренда инструментов' },
        icon: 'hammer-outline', color: '#9C27B0', sort_order: 2, ...rentalFlags,
        subcategories: [
          { value: 'power_tools', display: 'Цахилгаан багаж', labels: { mn: 'Цахилгаан багаж', en: 'Power Tools', zh: '电动工具', ru: 'Электроинструменты' } },
          { value: 'formwork', display: 'Хэв', labels: { mn: 'Хэв', en: 'Formwork', zh: '模板', ru: 'Опалубка' } },
          { value: 'scaffolding', display: 'Тулгуур', labels: { mn: 'Тулгуур', en: 'Scaffolding', zh: '脚手架', ru: 'Строительные леса' } },
          { value: 'measuring', display: 'Хэмжих багаж', labels: { mn: 'Хэмжих багаж', en: 'Measuring Tools', zh: '测量工具', ru: 'Измерительные инструменты' } },
        ],
        fields: rentalFields('2020'),
      },
      {
        key: 'materialstore', label: 'Барилгын материал',
        labels: { mn: 'Барилгын материал', en: 'Building Materials', zh: '建材商店', ru: 'Стройматериалы' },
        icon: 'layers-outline', color: '#795548', sort_order: 3,
        subcategories: [
          { value: 'individual', display: 'Хувиараа', labels: { mn: 'Хувиараа', en: 'Individual', zh: '个人', ru: 'Частный' } },
          { value: 'wholesale', display: 'Бөөний', labels: { mn: 'Бөөний', en: 'Wholesale', zh: '批发', ru: 'Оптовый' } },
          { value: 'retail', display: 'Жижиглэн', labels: { mn: 'Жижиглэн', en: 'Retail', zh: '零售', ru: 'Розничный' } },
        ],
        fields: [
          { key: 'main_products', label: 'Үндсэн бүтээгдэхүүн', labels: { mn: 'Үндсэн бүтээгдэхүүн', en: 'Main products', zh: '主要产品', ru: 'Основная продукция' }, type: 'text', placeholder: 'Цемент, хайрга, элс...', filterable: true },
          hoursField('09:00 - 18:00'),
        ],
      },
      {
        key: 'construction', label: 'Барилгын үйлчилгээ',
        labels: { mn: 'Барилгын үйлчилгээ', en: 'Construction Services', zh: '建筑服务', ru: 'Строительные услуги' },
        icon: 'business-outline', color: '#2196F3', sort_order: 4,
        has_rental_status: true, has_availability_dates: true, has_price: true, default_price_unit: 'PROJECT',
        subcategories: [
          { value: 'general', display: 'Ерөнхий барилга', labels: { mn: 'Ерөнхий барилга', en: 'General Construction', zh: '总承包', ru: 'Общестроительные работы' } },
          { value: 'interior', display: 'Интерьер засал', labels: { mn: 'Интерьер засал', en: 'Interior Finishing', zh: '内装修', ru: 'Внутренняя отделка' } },
          { value: 'exterior', display: 'Гадна засал', labels: { mn: 'Гадна засал', en: 'Exterior Finishing', zh: '外装修', ru: 'Наружная отделка' } },
          { value: 'electrical', display: 'Цахилгааны ажил', labels: { mn: 'Цахилгааны ажил', en: 'Electrical Work', zh: '电气安装', ru: 'Электромонтаж' } },
          { value: 'plumbing', display: 'Дүүргэлтийн ажил', labels: { mn: 'Дүүргэлтийн ажил', en: 'Plumbing', zh: '管道工程', ru: 'Сантехнические работы' } },
          { value: 'roofing', display: 'Дээвэр', labels: { mn: 'Дээвэр', en: 'Roofing', zh: '屋顶工程', ru: 'Кровельные работы' } },
          { value: 'flooring', display: 'Шал', labels: { mn: 'Шал', en: 'Flooring', zh: '地板工程', ru: 'Напольные покрытия' } },
          { value: 'painting', display: 'Будгийн ажил', labels: { mn: 'Будгийн ажил', en: 'Painting', zh: '油漆工程', ru: 'Малярные работы' } },
        ],
        fields: [],
      },
      {
        key: 'jobvacancy', label: 'Ажлын байр',
        labels: { mn: 'Ажлын байр', en: 'Job Vacancies', zh: '招聘', ru: 'Вакансии' },
        icon: 'briefcase-outline', color: '#E91E63', sort_order: 5,
        subcategories: [
          { value: 'engineer', display: 'Инженер', labels: { mn: 'Инженер', en: 'Engineer', zh: '工程师', ru: 'Инженер' } },
          { value: 'worker', display: 'Ажилчин', labels: { mn: 'Ажилчин', en: 'Worker', zh: '工人', ru: 'Рабочий' } },
          { value: 'driver', display: 'Жолооч', labels: { mn: 'Жолооч', en: 'Driver', zh: '司机', ru: 'Водитель' } },
          { value: 'welder', display: 'Гагнуурчин', labels: { mn: 'Гагнуурчин', en: 'Welder', zh: '焊工', ru: 'Сварщик' } },
          { value: 'electrician', display: 'Цахилгаанчин', labels: { mn: 'Цахилгаанчин', en: 'Electrician', zh: '电工', ru: 'Электрик' } },
          { value: 'plumber', display: 'Дүүргэлтийн', labels: { mn: 'Дүүргэлтийн', en: 'Plumber', zh: '管道工', ru: 'Сантехник' } },
          { value: 'manager', display: 'Менежер', labels: { mn: 'Менежер', en: 'Manager', zh: '经理', ru: 'Менеджер' } },
          { value: 'accountant', display: 'Нягтлан бодогч', labels: { mn: 'Нягтлан бодогч', en: 'Accountant', zh: '会计', ru: 'Бухгалтер' } },
        ],
        fields: [
          {
            key: 'employment_type', label: 'Ажлын төрөл',
            labels: { mn: 'Ажлын төрөл', en: 'Employment type', zh: '工作类型', ru: 'Тип занятости' },
            type: 'select', filterable: true,
            options: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE'],
          },
          { key: 'salary_range', label: 'Цалингийн хэмжээ', labels: { mn: 'Цалингийн хэмжээ', en: 'Salary range', zh: '薪资范围', ru: 'Диапазон зарплат' }, type: 'text', placeholder: '800,000 - 1,200,000₮' },
        ],
      },
      {
        key: 'factory', label: 'Үйлдвэр',
        labels: { mn: 'Үйлдвэр', en: 'Factory', zh: '工厂', ru: 'Производство' },
        icon: 'storefront-outline', color: '#607D8B', sort_order: 6,
        subcategories: [
          { value: 'concrete', display: 'Бетон бүтээгдэхүүн', labels: { mn: 'Бетон бүтээгдэхүүн', en: 'Concrete Products', zh: '混凝土制品', ru: 'Бетонные изделия' } },
          { value: 'metal', display: 'Металл бүтээгдэхүүн', labels: { mn: 'Металл бүтээгдэхүүн', en: 'Metal Products', zh: '金属制品', ru: 'Металлоизделия' } },
          { value: 'wood', display: 'Мод бүтээгдэхүүн', labels: { mn: 'Мод бүтээгдэхүүн', en: 'Wood Products', zh: '木制品', ru: 'Изделия из дерева' } },
          { value: 'brick', display: 'Тоосго', labels: { mn: 'Тоосго', en: 'Brick', zh: '砖', ru: 'Кирпич' } },
          { value: 'glass', display: 'Шил', labels: { mn: 'Шил', en: 'Glass', zh: '玻璃', ru: 'Стекло' } },
          { value: 'door_window', display: 'Хаалга, цонх', labels: { mn: 'Хаалга, цонх', en: 'Doors & Windows', zh: '门窗', ru: 'Двери и окна' } },
        ],
        fields: [
          { key: 'capacity', label: 'Хүчин чадал', labels: { mn: 'Хүчин чадал', en: 'Capacity', zh: '产能', ru: 'Мощность' }, type: 'text', placeholder: '100 ш/өдөр' },
          hoursField('08:00 - 17:00'),
        ],
      },
      {
        key: 'sos', label: 'SOS Үйлчилгээ',
        labels: { mn: 'SOS Үйлчилгээ', en: 'SOS Services', zh: '紧急服务', ru: 'Экстренные услуги' },
        icon: 'warning-outline', color: '#F44336', sort_order: 7,
        has_rental_status: true, has_price: true,
        subcategories: [
          { value: 'tire_repair', display: 'Дугуй засвар', labels: { mn: 'Дугуй засвар', en: 'Tire Repair', zh: '轮胎维修', ru: 'Шиномонтаж' } },
          { value: 'towing', display: 'Чирэлт', labels: { mn: 'Чирэлт', en: 'Towing', zh: '拖车', ru: 'Эвакуатор' } },
          { value: 'battery', display: 'Аккумулятор', labels: { mn: 'Аккумулятор', en: 'Battery Service', zh: '电瓶服务', ru: 'Аккумулятор' } },
        ],
        fields: [hoursField('24 цаг')],
      },
    ];

    await this.categoryRepository.save(categories.map(cat => this.categoryRepository.create(cat)));
    this.logger.log('Category schemas seeded.');
  }
}
