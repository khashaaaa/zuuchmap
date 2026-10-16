// Only what the formatters read, per locale, so `format` never imports a locale tree.
// format.test.ts holds every entry equal to the i18n resources.

export type FormatLocale = 'mn' | 'en' | 'zh' | 'ru';
export const FORMAT_DEFAULT_LOCALE: FormatLocale = 'mn';

export interface FormatLabels {
  invalidDate: string;
  priceUnit: Record<string, string>;
  distance: { km: string; m: string };
}

export const FORMAT_LABELS: Record<FormatLocale, FormatLabels> = {
  mn: {
    invalidDate: "Буруу огноо",
    distance: { km: "км", m: "м" },
    priceUnit: {
      HOUR: "цагаар",
      MOTO_HOUR: "мото цагаар",
      DAY: "өдрөөр",
      WEEK: "долоо хоногоор",
      MONTH: "сараар",
      PROJECT: "төслөөр",
      UNIT: "ширхэгээр",
      PIECE: "ширхэгээр",
      SQM: "м²-аар",
      TRIP: "рейсээр",
      TOTAL: "нийт үнэ",
    },
  },
  en: {
    invalidDate: "Invalid date",
    distance: { km: "km", m: "m" },
    priceUnit: {
      HOUR: "per hour",
      MOTO_HOUR: "per engine hour",
      DAY: "per day",
      WEEK: "per week",
      MONTH: "per month",
      PROJECT: "per project",
      UNIT: "per unit",
      PIECE: "per piece",
      SQM: "per m²",
      TRIP: "per trip",
      TOTAL: "total price",
    },
  },
  zh: {
    invalidDate: "日期无效",
    distance: { km: "公里", m: "米" },
    priceUnit: {
      HOUR: "每小时",
      MOTO_HOUR: "每台班小时",
      DAY: "每天",
      WEEK: "每周",
      MONTH: "每月",
      PROJECT: "每项目",
      UNIT: "每单位",
      PIECE: "每件",
      SQM: "每平方米",
      TRIP: "每趟",
      TOTAL: "总价",
    },
  },
  ru: {
    invalidDate: "Неверная дата",
    distance: { km: "км", m: "м" },
    priceUnit: {
      HOUR: "в час",
      MOTO_HOUR: "за моточас",
      DAY: "в день",
      WEEK: "в неделю",
      MONTH: "в месяц",
      PROJECT: "за проект",
      UNIT: "за единицу",
      PIECE: "за штуку",
      SQM: "за м²",
      TRIP: "за рейс",
      TOTAL: "общая цена",
    },
  },
};
