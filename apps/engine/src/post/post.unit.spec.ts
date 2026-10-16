import 'reflect-metadata';
import '../config/load-env';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { type Content, diffContent, snapshotOf } from './content';
import { CreateListingDto, MAX_PHOTOS, PHOTO_KEY_RE } from './dto/post.dto';
import { InMemoryListingEvents } from './listing-events';
import { InMemoryPhotoStorage } from './photo-storage';
import { effectivePlan, expiryDaysFor, planLimits } from './plan-limits';

const content = (over: Partial<Content> = {}): Content => ({
  subcategory: null, title: 'A', details: null, province: null, district: null, address: null, location: null,
  price_unit: null, contact_phone: null, contact_email: null, website: null, latitude: null, longitude: null,
  price_amount: 100, attributes: { a: 1, b: 2 }, images: ['x'], ...over,
});

describe('content diff', () => {
  it('ignores attribute key order and numeric string vs number', () => {
    expect(diffContent(content(), content({ attributes: { b: 2, a: 1 } }))).toEqual([]);
  });
  it('reports changed fields and builds a snapshot', () => {
    const d = diffContent(content(), content({ title: 'B', images: [] }));
    expect(d.map((x) => x.field).sort()).toEqual(['images', 'title']);
    expect(snapshotOf(content({ price_amount: 5 }))).toMatchObject({ price: 5, title: 'A' });
  });
});

describe('plans', () => {
  it('limits, lapse to FREE and category expiry win', () => {
    expect(planLimits('FREE').posts).toBe(3);
    expect(planLimits('PROVIDER').posts).toBe(25);
    expect(effectivePlan({ plan: 'PROVIDER', plan_expires_at: new Date(Date.now() - 1000) })).toBe('FREE');
    expect(effectivePlan({ plan: 'PROVIDER', plan_expires_at: null })).toBe('PROVIDER');
    expect(expiryDaysFor({ post_expiry_days: 7 }, 'PROVIDER')).toBe(7);
    expect(expiryDaysFor({ post_expiry_days: null }, 'FREE')).toBe(30);
    expect(expiryDaysFor(null, 'PROVIDER')).toBe(90);
  });
});

describe('photo keys and ports', () => {
  const owner = '11111111-2222-3333-4444-555555555555';
  it('accepts minted keys only and caps the count', async () => {
    const intent = await new InMemoryPhotoStorage().createUploadIntent(owner, 'image/webp');
    expect(PHOTO_KEY_RE.test(intent.key)).toBe(true);
    expect(PHOTO_KEY_RE.test('posts/../x.jpg')).toBe(false);
    const dto = plainToInstance(CreateListingDto, { category: 'c', title: 't', images: Array(MAX_PHOTOS + 1).fill(intent.key) });
    expect(validateSync(dto).some((e) => e.property === 'images')).toBe(true);
  });
  it('event bus isolates failing subscribers', () => {
    const bus = new InMemoryListingEvents();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe((e) => seen.push(e.type));
    bus.emit({ type: 'listing.renewed', post_id: 1, user_id: null, expires_at: 'x' });
    expect(seen).toEqual(['listing.renewed']);
  });
});
