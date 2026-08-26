import { PriceUnit, PRICE_UNITS, isPriceUnit } from './priceunit';

describe('PriceUnit', () => {
  it('includes MOTO_HOUR, distinct from HOUR', () => {
    // мото цаг is engine-meter time, not clock time — a machine on site ten
    // clock hours may log six мото цаг. Different numbers, different money.
    expect(PriceUnit.MOTO_HOUR).toBe('MOTO_HOUR');
    expect(PriceUnit.HOUR).toBe('HOUR');
    expect(PriceUnit.MOTO_HOUR).not.toBe(PriceUnit.HOUR);
  });

  it('exposes every unit the clients offer', () => {
    expect(PRICE_UNITS).toEqual([
      'HOUR',
      'MOTO_HOUR',
      'DAY',
      'WEEK',
      'MONTH',
      'PROJECT',
      'UNIT',
      'PIECE',
      'SQM',
      'TRIP',
      'TOTAL',
    ]);
  });

  it('validates membership', () => {
    expect(isPriceUnit('MOTO_HOUR')).toBe(true);
    expect(isPriceUnit('moto_hour')).toBe(false);
    expect(isPriceUnit('FORTNIGHT')).toBe(false);
    expect(isPriceUnit(undefined)).toBe(false);
  });
});
