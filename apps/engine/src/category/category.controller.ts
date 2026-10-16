import { Body, Controller, Get, Headers, Param, Put, Query, UseGuards } from '@nestjs/common';
import { DEFAULT_LOCALE, LOCALES, type CategoriesResponse, type CategoryView, type Locale } from '@zuuchmap/core';
import { AdminGuard } from './admin-guard';
import { CategoryService, type CategoryUpsertInput, type CategoryUsage } from './category.service';
import type { CategorySchema } from './category.entity';

/** `?lang=` wins, then the first supported Accept-Language tag, then mn. */
export function resolveLocale(lang?: string, acceptLanguage?: string): Locale {
  const ok = (v: string | undefined): Locale | undefined =>
    v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : undefined;
  const fromQuery = ok(lang?.trim().toLowerCase());
  if (fromQuery) return fromQuery;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    const hit = ok(tag);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}

@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  /** Categories and families together: every client needs both on its first screen. */
  @Get()
  async list(@Query('lang') lang?: string, @Headers('accept-language') al?: string): Promise<CategoriesResponse> {
    const locale = resolveLocale(lang, al);
    const [categories, families] = await Promise.all([this.categories.list(locale), this.categories.families(locale)]);
    return { categories, families };
  }

  @Get(':key')
  one(@Param('key') key: string, @Query('lang') lang?: string, @Headers('accept-language') al?: string): Promise<CategoryView> {
    return this.categories.getView(key, resolveLocale(lang, al));
  }
}

@Controller('admin/categories')
@UseGuards(AdminGuard)
export class CategoryAdminController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  list(): Promise<CategorySchema[]> {
    return this.categories.listEntities(true);
  }

  @Get(':key')
  one(@Param('key') key: string): Promise<CategorySchema> {
    return this.categories.get(key);
  }

  @Get(':key/usage')
  usage(@Param('key') key: string): Promise<CategoryUsage> {
    return this.categories.usage(key);
  }

  @Put(':key')
  upsert(@Param('key') key: string, @Body() body: CategoryUpsertInput): Promise<CategorySchema> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a missing body is undefined at runtime
    return this.categories.upsert(key, body ?? {});
  }
}
