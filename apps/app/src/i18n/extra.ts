import type { TranslationTree } from '@zuuchmap/core';

/** App-only strings, merged under core's resources. Anything the web also shows belongs in core. */
export const extra: Record<'mn' | 'en' | 'zh' | 'ru', TranslationTree> = {
  mn: {
    ui: {
      days: '{{days}} өдөр',
      clearSearch: 'Хайлтыг арилгах',
      unread: 'Уншаагүй {{count}}',
      removeChip: '{{label}} хасах',
      required: 'Заавал бөглөнө үү', invalid: 'Утга буруу байна',
      repliesIn: 'Ихэвчлэн {{hours}} цагт хариулдаг',
      undo: 'Буцаах',
    },
  },
  en: {
    ui: {
      days: '{{days}} days',
      clearSearch: 'Clear search',
      unread: '{{count}} unread',
      removeChip: 'Remove {{label}}',
      required: 'This field is required', invalid: 'Invalid value',
      repliesIn: 'Usually replies within {{hours}} h',
      undo: 'Undo',
    },
  },
  zh: {
    ui: {
      days: '{{days}} 天',
      clearSearch: '清除搜索',
      unread: '{{count}} 条未读',
      removeChip: '移除 {{label}}',
      required: '此项必填', invalid: '值无效',
      repliesIn: '通常 {{hours}} 小时内回复',
      undo: '撤销',
    },
  },
  ru: {
    ui: {
      days: '{{days}} дн.',
      clearSearch: 'Очистить поиск',
      unread: 'Непрочитано: {{count}}',
      removeChip: 'Убрать {{label}}',
      required: 'Обязательное поле', invalid: 'Недопустимое значение',
      repliesIn: 'Обычно отвечает за {{hours}} ч',
      undo: 'Отменить',
    },
  },
};
