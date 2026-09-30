/**
 * Push notification copy, in every locale the app ships.
 *
 * The text was written inline at each call site, in Mongolian only, while the
 * app renders `mn en zh ru` — so a user reading the app in Russian got every
 * push in a language they had not chosen. A device now registers its locale
 * with its token (`push_device.locale`) and the fan-out resolves the text per
 * device. A device that never said (an older build) gets Mongolian, which is
 * what it got before.
 *
 * Admin pushes (new post, new report) and broadcasts are not here: the first
 * two go to the operators, the third is typed by one.
 */
export const PUSH_LOCALES = ['mn', 'en', 'zh', 'ru'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/** Text that is either fixed or depends on the recipient device's locale. */
export type Localized = string | ((locale: PushLocale) => string);

export const pushLocale = (value: unknown): PushLocale =>
  PUSH_LOCALES.includes(value as PushLocale) ? (value as PushLocale) : 'mn';

/** A client-supplied locale, or undefined when it names none we ship. */
export const knownLocale = (value: unknown): PushLocale | undefined =>
  PUSH_LOCALES.includes(value as PushLocale) ? (value as PushLocale) : undefined;

export const resolveText = (text: Localized, locale: PushLocale): string =>
  typeof text === 'string' ? text : text(locale);

const pick =
  (byLocale: Record<PushLocale, string>): Localized =>
  (locale) =>
    byLocale[locale] ?? byLocale.mn;

export const PUSH = {
  bookingRequested: {
    title: pick({
      mn: 'Шинэ захиалгын хүсэлт',
      en: 'New booking request',
      zh: '新的预订请求',
      ru: 'Новый запрос на бронирование',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" зарт захиалгын хүсэлт ирлээ.`,
        en: `"${post}" has a new booking request.`,
        zh: `"${post}" 收到新的预订请求。`,
        ru: `Новый запрос на бронирование по объявлению «${post}».`,
      }),
  },
  bookingAccepted: {
    title: pick({
      mn: 'Захиалга баталгаажлаа',
      en: 'Booking confirmed',
      zh: '预订已确认',
      ru: 'Бронирование подтверждено',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" захиалгын хүсэлт зөвшөөрөгдлөө.`,
        en: `Your booking request for "${post}" was accepted.`,
        zh: `您对 "${post}" 的预订请求已被接受。`,
        ru: `Ваш запрос на бронирование «${post}» принят.`,
      }),
  },
  bookingDeclined: {
    title: pick({
      mn: 'Захиалга татгалзагдлаа',
      en: 'Booking declined',
      zh: '预订被拒绝',
      ru: 'Бронирование отклонено',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" захиалгын хүсэлт татгалзагдлаа.`,
        en: `Your booking request for "${post}" was declined.`,
        zh: `您对 "${post}" 的预订请求已被拒绝。`,
        ru: `Ваш запрос на бронирование «${post}» отклонён.`,
      }),
  },
  bookingCancelled: {
    title: pick({
      mn: 'Захиалга цуцлагдлаа',
      en: 'Booking cancelled',
      zh: '预订已取消',
      ru: 'Бронирование отменено',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" захиалга цуцлагдлаа.`,
        en: `The booking for "${post}" was cancelled.`,
        zh: `"${post}" 的预订已取消。`,
        ru: `Бронирование «${post}» отменено.`,
      }),
  },
  reviewPrompt: {
    title: pick({
      mn: 'Үнэлгээ өгөх үү?',
      en: 'Leave a review?',
      zh: '要留下评价吗？',
      ru: 'Оставить отзыв?',
    }),
    body: pick({
      mn: 'Таны түрээс дууслаа. Үйлчилгээ үзүүлэгчийг үнэлж бусдад туслаарай.',
      en: 'Your rental has ended. Rate the provider to help others.',
      zh: '您的租赁已结束。为服务商评分，帮助其他用户。',
      ru: 'Ваша аренда завершена. Оцените исполнителя — это поможет другим.',
    }),
  },
  postApproved: {
    title: pick({
      mn: 'Зар зөвшөөрөгдлөө',
      en: 'Listing approved',
      zh: '信息已通过审核',
      ru: 'Объявление одобрено',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" нийтлэгдлээ. Та одоо харагдаж байна.`,
        en: `"${post}" is published. You are now visible.`,
        zh: `"${post}" 已发布，现在可以被看到。`,
        ru: `«${post}» опубликовано. Теперь вас видят.`,
      }),
  },
  revisionApproved: {
    title: pick({
      mn: 'Засвар зөвшөөрөгдлөө',
      en: 'Edit approved',
      zh: '修改已通过审核',
      ru: 'Изменения одобрены',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" зарын засвар нийтлэгдлээ.`,
        en: `Your edit to "${post}" is published.`,
        zh: `您对 "${post}" 的修改已发布。`,
        ru: `Изменения в объявлении «${post}» опубликованы.`,
      }),
  },
  postRejected: {
    title: (post: string) =>
      pick({
        mn: `"${post}" зөвшөөрөгдсөнгүй`,
        en: `"${post}" was not approved`,
        zh: `"${post}" 未通过审核`,
        ru: `«${post}» не одобрено`,
      }),
    body: (reason: string) =>
      pick({
        mn: `Шалтгаан: ${reason}`,
        en: `Reason: ${reason}`,
        zh: `原因：${reason}`,
        ru: `Причина: ${reason}`,
      }),
  },
  revisionRejected: {
    title: (post: string) =>
      pick({
        mn: `"${post}" зарын засвар зөвшөөрөгдсөнгүй`,
        en: `Your edit to "${post}" was not approved`,
        zh: `您对 "${post}" 的修改未通过审核`,
        ru: `Изменения в объявлении «${post}» не одобрены`,
      }),
    body: (reason: string) =>
      pick({
        mn: `Шалтгаан: ${reason}\n\nӨмнөх хувилбар хэвээр нийтлэгдэж байна.`,
        en: `Reason: ${reason}\n\nThe previous version is still published.`,
        zh: `原因：${reason}\n\n之前的版本仍在发布中。`,
        ru: `Причина: ${reason}\n\nПредыдущая версия по-прежнему опубликована.`,
      }),
  },
  postExpired: {
    title: pick({
      mn: 'Таны зарын хугацаа дууслаа',
      en: 'Your listing has expired',
      zh: '您的信息已过期',
      ru: 'Срок вашего объявления истёк',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" зар хугацаа дуусаж, жагсаалтаас хасагдлаа. Сунгах товч дарж эргүүлэн нийтэлнэ үү.`,
        en: `"${post}" has expired and left the listings. Tap Renew to publish it again.`,
        zh: `"${post}" 已过期并从列表中移除。点击续期即可重新发布。`,
        ru: `Срок объявления «${post}» истёк, оно снято с публикации. Нажмите «Продлить», чтобы опубликовать снова.`,
      }),
  },
  postExpiring: {
    title: pick({
      mn: 'Таны зарын хугацаа дуусах гэж байна',
      en: 'Your listing is about to expire',
      zh: '您的信息即将过期',
      ru: 'Срок вашего объявления истекает',
    }),
    body: (post: string, days: number) =>
      pick({
        mn: `"${post}" зар ${days} хоногийн дараа жагсаалтаас хасагдана. Сунгах товч дарж хугацааг нь сунгаарай.`,
        en: `"${post}" leaves the listings in ${days} day(s). Tap Renew to extend it.`,
        zh: `"${post}" 将在 ${days} 天后从列表中移除。点击续期即可延长。`,
        ru: `Объявление «${post}» будет снято через ${days} дн. Нажмите «Продлить», чтобы продлить срок.`,
      }),
  },
  savedSearch: {
    title: pick({
      mn: 'Таны хайлтад шинэ зар',
      en: 'New listing for your search',
      zh: '您的搜索有新信息',
      ru: 'Новое объявление по вашему поиску',
    }),
    body: (post: string) =>
      pick({
        mn: `"${post}" таны хадгалсан хайлтад тохирч байна.`,
        en: `"${post}" matches your saved search.`,
        zh: `"${post}" 符合您保存的搜索。`,
        ru: `«${post}» подходит под ваш сохранённый поиск.`,
      }),
  },
  newMessage: {
    title: pick({
      mn: 'Шинэ мессеж',
      en: 'New message',
      zh: '新消息',
      ru: 'Новое сообщение',
    }),
  },
};
