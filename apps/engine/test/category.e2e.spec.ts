import type { Server } from 'node:http';
import { CanActivate, ExecutionContext, Injectable, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AdminGuard } from '../src/category/admin-guard';
import { CategoryAdminController, CategoryController } from '../src/category/category.controller';
import { CategorySchema } from '../src/category/category.entity';
import { CATEGORY_SEED } from '../src/category/seed/category-seed';
import { CategoryService } from '../src/category/category.service';

/** Test guard: admin only when the x-test-admin header is set. */
@Injectable()
class HeaderAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    return ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>().headers['x-test-admin'] === '1';
  }
}

describe('categories (postgres)', () => {
  let app: INestApplication;
  let svc: CategoryService;
  let ds: DataSource;
  const http = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions(), entities: [CategorySchema] }),
        TypeOrmModule.forFeature([CategorySchema]),
      ],
      controllers: [CategoryController, CategoryAdminController],
      providers: [CategoryService],
    })
      .overrideGuard(AdminGuard)
      .useClass(HeaderAdminGuard)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    svc = mod.get(CategoryService);
    ds = mod.get(DataSource);
    // Only the seeded keys: other suites keep their own test categories in this shared table.
    await ds.query('DELETE FROM category_schema WHERE key = ANY($1)', [CATEGORY_SEED.map((c) => c.key)]);
    await svc.seed();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seed is idempotent and never overwrites edits', async () => {
    await ds.query("UPDATE category_schema SET label = 'edited' WHERE key = 'sos'");
    expect(await svc.seed()).toBe(0);
    const [{ count }] = await ds.query<Array<{ count: number }>>('SELECT count(*)::int AS count FROM category_schema WHERE key = ANY($1)', [CATEGORY_SEED.map((c) => c.key)]);
    expect(count).toBe(CATEGORY_SEED.length);
    expect((await svc.get('sos')).label).toBe('edited');
    await ds.query("UPDATE category_schema SET label = 'SOS Үйлчилгээ' WHERE key = 'sos'");
  });

  it('GET /categories is localized', async () => {
    const res = await request(http()).get('/api/categories?lang=en').expect(200);
    const body = (res.body as { categories: Array<{ key: string; label: string; family: string; primary_action: string; pinned: boolean }> }).categories;
    expect(body).toHaveLength(13);
    expect(body.find((c) => c.key === 'vehiclerent')).toMatchObject({ label: 'Vehicle Rental', primary_action: 'BOOK' });
    expect(body.find((c) => c.key === 'sos')).toMatchObject({ primary_action: 'CALL_NOW', pinned: true });
    expect(body.find((c) => c.key === 'jobvacancy')?.primary_action).toBe('CALL');
  });

  it('GET /categories carries the families, counted through the provider', async () => {
    svc.setCountProvider(() => Promise.resolve({ vehiclerent: 3, toolrent: 2, jobvacancy: 5 }));
    const res = await request(http()).get('/api/categories?lang=ru').expect(200);
    const fams = (res.body as { families: Array<{ key: string; count: number; label: string; categories: string[] }> }).families;
    expect(fams.map((f) => f.key)).toEqual(['EQUIPMENT_VEHICLES', 'MATERIALS_PRODUCTION', 'SERVICES', 'JOBS']);
    expect(fams.find((f) => f.key === 'EQUIPMENT_VEHICLES')).toMatchObject({ count: 5, label: 'Техника и транспорт' });
    expect(fams.find((f) => f.key === 'JOBS')?.count).toBe(5);
    expect(fams.find((f) => f.key === 'SERVICES')?.count).toBe(0);
  });

  it('admin routes reject non-admins', async () => {
    await request(http()).get('/api/admin/categories').expect(403);
    await request(http()).put('/api/admin/categories/sos').send({ icon: 'truck' }).expect(403);
  });

  it('admin can edit; unknown icons are refused and legacy ones fall back', async () => {
    await request(http())
      .put('/api/admin/categories/sos')
      .set('x-test-admin', '1')
      .send({ icon: 'not-a-lucide-icon' })
      .expect(400);
    await request(http()).put('/api/admin/categories/sos').set('x-test-admin', '1').send({ icon: 'phone' }).expect(200);
    await ds.query("UPDATE category_schema SET icon = 'warning-outline' WHERE key = 'sos'");
    const res = await request(http()).get('/api/categories/sos').expect(200);
    expect((res.body as { icon: string }).icon).toBe('wrench');
    await ds.query("UPDATE category_schema SET icon = 'alert-triangle' WHERE key = 'sos'");
  });

  it('admin can create a new category and validateAttributes uses it', async () => {
    await request(http())
      .put('/api/admin/categories/cranes_test')
      .set('x-test-admin', '1')
      .send({
        family: 'EQUIPMENT_VEHICLES',
        label: 'Кран',
        labels: { mn: 'Кран', en: 'Crane', zh: '起重机', ru: 'Кран' },
        rentable: true,
        fields: [{ key: 'tons', label: 'Tons', type: 'number', required: true, min: 1, max: 500 }],
      })
      .expect(200);
    expect((await svc.validateAttributes('cranes_test', null, { tons: 20 })).ok).toBe(true);
    expect((await svc.validateAttributes('cranes_test', null, {})).errors[0]?.code).toBe('required');
    expect((await svc.validateAttributes('cranes_test', null, { tons: 900 })).errors[0]?.code).toBe('max');
    expect((await svc.validateAttributes('nope', null, {})).errors[0]?.code).toBe('unknown_category');
    await ds.query("DELETE FROM category_schema WHERE key = 'cranes_test'");
  });

  it('rejects an invalid family and missing locales', async () => {
    await request(http())
      .put('/api/admin/categories/bad_one')
      .set('x-test-admin', '1')
      .send({ family: 'NOPE', label: 'x', labels: { mn: 'x' } })
      .expect(400);
  });
});
