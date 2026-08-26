import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCompanyDto } from './create-company.dto';
import { UpdateUserDto } from '../../user/dto/update-user.dto';

/**
 * These two DTOs are assigned straight onto their entities, and neither column
 * set carries a length cap in Postgres, so the decorators here are the whole of
 * the input sanitisation for those routes.
 */
const errorsFor = (cls: any, payload: object) =>
  validateSync(plainToInstance(cls, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));

describe('CreateCompanyDto', () => {
  it('accepts a normal company', () => {
    expect(
      errorsFor(CreateCompanyDto, {
        name: 'Хас Бարилга',
        description: 'Барилгын гүйцэтгэгч',
        website: 'https://example.mn',
        email: 'info@example.mn',
        phone_number: '99112233',
        address: 'УБ, ХУД',
        registration_number: '1234567',
        tax_id: '99',
      }),
    ).toEqual([]);
  });

  it('accepts a blank optional field — an emptied input is a clear, not an error', () => {
    expect(
      errorsFor(CreateCompanyDto, { name: 'X', email: '', website: '' }),
    ).toEqual([]);
  });

  it('rejects a non-string where a string is expected', () => {
    expect(errorsFor(CreateCompanyDto, { name: { $ne: null } })).toContain(
      'name',
    );
    expect(errorsFor(CreateCompanyDto, { description: ['a', 'b'] })).toContain(
      'description',
    );
  });

  it('rejects unbounded text — the columns have no length cap of their own', () => {
    expect(
      errorsFor(CreateCompanyDto, { description: 'x'.repeat(2001) }),
    ).toContain('description');
    expect(errorsFor(CreateCompanyDto, { name: 'x'.repeat(121) })).toContain(
      'name',
    );
    expect(
      errorsFor(CreateCompanyDto, { registration_number: 'x'.repeat(33) }),
    ).toContain('registration_number');
  });

  it('rejects a malformed email but only when one was supplied', () => {
    expect(errorsFor(CreateCompanyDto, { email: 'not-an-email' })).toContain(
      'email',
    );
  });

  it('rejects an unknown property outright', () => {
    expect(errorsFor(CreateCompanyDto, { is_verified: true })).toContain(
      'is_verified',
    );
  });
});

describe('UpdateUserDto', () => {
  it('accepts the two real account types', () => {
    expect(errorsFor(UpdateUserDto, { type: 'PROVIDER' })).toEqual([]);
    expect(errorsFor(UpdateUserDto, { type: 'CUSTOMER' })).toEqual([]);
  });

  // POST /user/type enforces this list; PATCH /user/:id used to let a client
  // walk straight around it and store any string at all.
  it('rejects an account type outside the enum', () => {
    for (const type of ['ADMIN', 'provider', '', 'SUPERUSER']) {
      expect(errorsFor(UpdateUserDto, { type })).toContain('type');
    }
  });

  it('bounds the free-text profile fields', () => {
    expect(errorsFor(UpdateUserDto, { given_name: 'x'.repeat(101) })).toContain(
      'given_name',
    );
    expect(errorsFor(UpdateUserDto, { address: 'x'.repeat(301) })).toContain(
      'address',
    );
    expect(
      errorsFor(UpdateUserDto, { profile_picture: 'x'.repeat(513) }),
    ).toContain('profile_picture');
  });

  it('still allows clearing an email', () => {
    expect(errorsFor(UpdateUserDto, { email: '' })).toEqual([]);
  });
});
