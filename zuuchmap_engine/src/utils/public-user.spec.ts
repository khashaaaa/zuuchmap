import { publicUser, publicCompany } from './public-user';

const company = {
  id: 'c1',
  name: 'Ulaanbaatar Machinery LLC',
  website: 'https://example.mn',
  address: 'SBD 1-r khoroo',
  phone_number: '99112233',
  email: 'info@example.mn',
  registration_number: '6183472',
  tax_id: 'TAX-9911',
  is_verified: true,
};

const user = {
  id: 'u1',
  type: 'PROVIDER',
  phone_number: '88112233',
  given_name: 'Bat',
  parent_name: 'Dorj',
  email: 'bat@example.mn',
  profile_picture: 'p.jpg',
  is_verified: true,
  date_created: new Date('2026-01-01'),
  push_token: 'ExponentPushToken[secret]',
  company,
};

describe('publicCompany', () => {
  // These reach anonymous callers through `GET /posts/:id`, `GET /posts`,
  // `GET /posts/map` and `GET /company/:id`. They identify the business to the
  // state register and nothing renders them outside the owner's own form and
  // the admin user detail page.
  it('withholds the registration number and tax id by default', () => {
    const out = publicCompany(company);
    expect(out.registration_number).toBeUndefined();
    expect(out.tax_id).toBeUndefined();
  });

  it('keeps the rest of the business-public fields', () => {
    const out = publicCompany(company);
    expect(out).toMatchObject({
      id: 'c1',
      name: 'Ulaanbaatar Machinery LLC',
      website: 'https://example.mn',
      phone_number: '99112233',
      is_verified: true,
    });
  });

  it('returns them when the caller is entitled to them', () => {
    const out = publicCompany(company, { includePrivate: true });
    expect(out.registration_number).toBe('6183472');
    expect(out.tax_id).toBe('TAX-9911');
  });

  it('does not mutate the entity it was handed', () => {
    publicCompany(company);
    expect(company.tax_id).toBe('TAX-9911');
  });

  it('passes null/undefined straight through', () => {
    expect(publicCompany(null)).toBeNull();
    expect(publicCompany(undefined)).toBeNull();
  });
});

describe('publicUser', () => {
  it('never serializes the push token', () => {
    expect((publicUser(user) as any).push_token).toBeUndefined();
  });

  it('strips company credentials through the nested projection', () => {
    const out = publicUser(user);
    expect(out.company.name).toBe('Ulaanbaatar Machinery LLC');
    expect(out.company.registration_number).toBeUndefined();
    expect(out.company.tax_id).toBeUndefined();
  });

  // Providers publish these on their listings by design.
  it('keeps the contact fields a listing is meant to show', () => {
    const out = publicUser(user);
    expect(out.phone_number).toBe('88112233');
    expect(out.email).toBe('bat@example.mn');
  });
});
