import { validateRequiredAttributes } from './post.service';

const schema: any = {
  key: 'machineryrent',
  fields: [
    {
      key: 'manufacturer',
      label: 'M',
      type: 'text',
      required: true,
      group: 'core',
    },
    {
      key: 'with_operator',
      label: 'O',
      type: 'boolean',
      required: true,
      group: 'core',
    },
    {
      key: 'capacity',
      label: 'C',
      type: 'number',
      required: true,
      group: 'core',
    },
    { key: 'min_rental_days', label: 'D', type: 'number', group: 'details' },
  ],
};

describe('validateRequiredAttributes', () => {
  it('accepts a complete core set', () => {
    expect(
      validateRequiredAttributes(schema, {
        manufacturer: 'Komatsu',
        with_operator: true,
        capacity: 20,
      }),
    ).toEqual([]);
  });

  it('names every missing required field', () => {
    expect(
      validateRequiredAttributes(schema, { manufacturer: 'Komatsu' }).sort(),
    ).toEqual(['capacity', 'with_operator']);
  });

  it('accepts boolean false — false is an answer, not an absence', () => {
    expect(
      validateRequiredAttributes(schema, {
        manufacturer: 'Komatsu',
        with_operator: false,
        capacity: 20,
      }),
    ).toEqual([]);
  });

  it('accepts numeric zero', () => {
    expect(
      validateRequiredAttributes(schema, {
        manufacturer: 'K',
        with_operator: true,
        capacity: 0,
      }),
    ).toEqual([]);
  });

  it('rejects empty string and null', () => {
    expect(
      validateRequiredAttributes(schema, {
        manufacturer: '  ',
        with_operator: true,
        capacity: null,
      }).sort(),
    ).toEqual(['capacity', 'manufacturer']);
  });

  it('ignores optional details fields', () => {
    expect(
      validateRequiredAttributes(schema, {
        manufacturer: 'K',
        with_operator: true,
        capacity: 5,
        min_rental_days: undefined,
      }),
    ).toEqual([]);
  });
});
