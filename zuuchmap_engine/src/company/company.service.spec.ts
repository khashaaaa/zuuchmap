import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompanyService } from './company.service';

jest.mock('../utils/uploader', () => ({
  deleteSingleImage: jest.fn(async () => undefined),
}));
import { deleteSingleImage } from '../utils/uploader';

/**
 * Company profiles.
 *
 * The DTOs here carry no server-side validation decorators — the clients'
 * shared `validateEmail`/`validatePhone`/`normalizeWebsiteUrl` are the only
 * gate (see the form-validation contract in check-sync). That makes what this
 * service DOES do — link the owner, and not orphan a replaced logo — worth
 * pinning down. It had only a DTO spec before.
 */
const make = (over: any = {}) => {
  const companyRepository = {
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: 'company-1', ...x })),
    findOne: jest.fn(async () => ('company' in over ? over.company : { id: 'company-1', logo: null })),
    ...over.companyRepository,
  };
  const userRepository = {
    findOne: jest.fn(async () => ('user' in over ? over.user : { id: 'user-1' })),
    save: jest.fn(async (x: any) => x),
  };
  const svc = new CompanyService(companyRepository as any, userRepository as any);
  return { svc, companyRepository, userRepository };
};

describe('CompanyService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links the new company to its owner', async () => {
    const { svc, userRepository } = make();
    const company = await svc.create({ name: 'Bolor LLC', userId: 'user-1' } as any);

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', company: expect.objectContaining({ id: 'company-1' }) }),
    );
    expect(company).toMatchObject({ id: 'company-1', name: 'Bolor LLC' });
  });

  it('never writes userId onto the company row itself', async () => {
    const { svc, companyRepository } = make();
    await svc.create({ name: 'Bolor LLC', userId: 'user-1' } as any);
    // It is a link, not a column — the relation lives on the user side.
    expect(companyRepository.create.mock.calls[0][0]).not.toHaveProperty('userId');
  });

  it('creates an unowned company when no userId is given', async () => {
    const { svc, userRepository } = make();
    await svc.create({ name: 'Bolor LLC' } as any);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('surfaces a missing owner as NotFound, not as a generic bad request', async () => {
    // The catch-all below rewraps everything into BadRequest; NotFound has to
    // be re-thrown ahead of it or "no such user" reaches the client as 400.
    const { svc } = make({ user: null });
    await expect(svc.create({ name: 'Bolor LLC', userId: 'ghost' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('wraps a database failure as a bad request', async () => {
    const { svc, companyRepository } = make();
    companyRepository.save.mockRejectedValueOnce(new Error('duplicate key'));
    await expect(svc.create({ name: 'Bolor LLC' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CompanyService.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the old logo when a different one replaces it', async () => {
    const { svc } = make({ company: { id: 'company-1', logo: 'old.png' } });
    await svc.update('company-1', { logo: 'new.png' } as any);
    expect(deleteSingleImage).toHaveBeenCalledWith('old.png');
  });

  it('keeps the logo when the update re-sends the same one', async () => {
    // A form that submits every field unchanged would otherwise delete the very
    // object it is about to store the name of.
    const { svc } = make({ company: { id: 'company-1', logo: 'same.png' } });
    await svc.update('company-1', { logo: 'same.png' } as any);
    expect(deleteSingleImage).not.toHaveBeenCalled();
  });

  it('does not touch the logo when the update carries none', async () => {
    const { svc } = make({ company: { id: 'company-1', logo: 'old.png' } });
    await svc.update('company-1', { name: 'Renamed LLC' } as any);
    expect(deleteSingleImage).not.toHaveBeenCalled();
  });

  it('raises NotFound for a company that does not exist', async () => {
    const { svc } = make({ company: null });
    await expect(svc.update('nope', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
