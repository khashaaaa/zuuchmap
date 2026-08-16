import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategorySchema } from './entities/category-schema.entity';

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: {
    find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; count: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      count: jest.fn(),
    };
    service = new CategoryService(repo as any);
  });

  describe('validateCategoryData', () => {
    const valid = (over: Partial<CategorySchema> = {}): Partial<CategorySchema> => ({
      key: 'testcat',
      label: 'Test',
      fields: [{ key: 'foo_bar', label: 'F', type: 'text' }],
      subcategories: [{ value: 'a', display: 'A' }],
      ...over,
    });

    it('accepts a valid schema', () => {
      expect(() => service.validateCategoryData(valid())).not.toThrow();
    });

    it('rejects field keys that shadow post columns', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [{ key: 'title', label: 'T', type: 'text' }],
      }))).toThrow(BadRequestException);
    });

    it('rejects non-snake_case field keys', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [{ key: 'Foo Bar', label: 'F', type: 'text' }],
      }))).toThrow(BadRequestException);
    });

    it('rejects unknown field types', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [{ key: 'foo', label: 'F', type: 'checkbox' as any }],
      }))).toThrow(BadRequestException);
    });

    it('rejects duplicate field keys', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [
          { key: 'foo', label: 'F', type: 'text' },
          { key: 'foo', label: 'F2', type: 'text' },
        ],
      }))).toThrow(BadRequestException);
    });

    it('rejects select fields without options', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [{ key: 'foo', label: 'F', type: 'select' }],
      }))).toThrow(BadRequestException);
    });

    it('accepts select fields with options', () => {
      expect(() => service.validateCategoryData(valid({
        fields: [{ key: 'foo', label: 'F', type: 'select', options: ['A'] }],
      }))).not.toThrow();
    });

    it('rejects duplicate subcategory values', () => {
      expect(() => service.validateCategoryData(valid({
        subcategories: [{ value: 'a', display: 'A' }, { value: 'a', display: 'A2' }],
      }))).toThrow(BadRequestException);
    });

    it('accepts empty fields and subcategories', () => {
      expect(() => service.validateCategoryData({ key: 'x', label: 'X' })).not.toThrow();
    });
  });

  describe('getCategory', () => {
    it('throws NotFound for a missing key', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getCategory('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns the category when found', async () => {
      repo.findOne.mockResolvedValue({ key: 'vehiclerent' });
      await expect(service.getCategory('vehiclerent')).resolves.toEqual({ key: 'vehiclerent' });
    });
  });

  describe('getCategories caching', () => {
    it('hits the repository once and serves the second call from cache', async () => {
      repo.find.mockResolvedValue([{ key: 'a' }]);
      await service.getCategories();
      await service.getCategories();
      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it('invalidates the cache on createCategory', async () => {
      repo.find.mockResolvedValue([{ key: 'a' }]);
      await service.getCategories();
      await service.createCategory({ key: 'b', label: 'B' });
      await service.getCategories();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('seedCategories', () => {
    it('does nothing when categories already exist', async () => {
      repo.count.mockResolvedValue(8);
      await service.seedCategories();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('seeds 8 categories on an empty table, all passing validation', async () => {
      repo.count.mockResolvedValue(0);
      await service.seedCategories();
      expect(repo.save).toHaveBeenCalledTimes(1);
      const seeded = repo.save.mock.calls[0][0];
      expect(seeded).toHaveLength(8);
      for (const cat of seeded) {
        expect(() => service.validateCategoryData(cat)).not.toThrow();
        expect(cat.labels).toEqual(expect.objectContaining({ mn: expect.any(String), en: expect.any(String) }));
      }
      const rentals = seeded.filter((c: any) => c.has_rental_status);
      expect(rentals.map((c: any) => c.key).sort()).toEqual(
        ['construction', 'machineryrent', 'sos', 'toolrent', 'vehiclerent'],
      );
    });
  });
});
