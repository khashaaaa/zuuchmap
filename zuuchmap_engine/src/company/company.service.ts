import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { User } from '../user/entities/user.entity';
import { assertProvider } from '../enums/usertype';
import { deleteSingleImage } from '../utils/uploader';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const { userId, ...companyData } = createCompanyDto;
    // Checked before the save: an orphan company row was left behind
    // whenever the owner lookup failed after it.
    const user = userId
      ? await this.userRepository.findOne({
          where: { id: userId },
          relations: ['company'],
        })
      : null;
    if (userId && !user)
      throw new NotFoundException(`User with ID ${userId} not found`);
    if (user) assertProvider(user);
    if (user?.company) throw companyExists();

    try {
      return await this.companyRepository.manager.transaction(async (em) => {
        const saved = await em.save(em.create(Company, companyData));
        if (user) {
          // Conditional, not read-then-write: two creates racing (a double tap,
          // web and app at once) must not both attach, or the first company is
          // orphaned along with its logo and any verification it earns.
          const { affected } = await em
            .createQueryBuilder()
            .update(User)
            .set({ company: { id: saved.id } })
            .where('id = :id AND "companyId" IS NULL', { id: user.id })
            .execute();
          if (!affected) throw companyExists();
        }
        return saved;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to create company: ${error.message}`);
      throw new BadRequestException('Failed to create company');
    }
  }

  /**
   * Whether the account belongs to the company. Asked of the database rather
   * than read off `req.user`: the request user is identity only, and a company
   * created a moment ago must be manageable by the person who created it.
   */
  async isMember(userId: string, companyId: string): Promise<boolean> {
    if (!userId || !companyId) return false;
    const count = await this.userRepository.count({
      where: { id: userId, company: { id: companyId } },
    });
    return count > 0;
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['users'],
    });
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.findOne(id);
    const { remove_logo, ...changes } = updateCompanyDto;
    const oldLogo = company.logo;

    // The badge says an admin matched these against the state register; once
    // any of them changes, that check no longer covers what customers see.
    if (
      company.is_verified &&
      VERIFIED_FIELDS.some(
        (f) =>
          changes[f] !== undefined &&
          (changes[f] ?? '').trim() !== (company[f] ?? '').trim(),
      )
    ) {
      company.is_verified = false;
    }

    Object.assign(company, changes);
    if (remove_logo === 'true' && !changes.logo) company.logo = null;
    const saved = await this.companyRepository.save(company);

    // Only once the row no longer points at it: deleting first left a company
    // showing a broken logo whenever the save failed.
    if (oldLogo && saved.logo !== oldLogo) await deleteSingleImage(oldLogo);
    return saved;
  }

  /**
   * Account deletion: a company with no members left is unreachable — nothing
   * can manage, show or verify it — so it goes, with its logo.
   */
  async removeIfOrphaned(companyId: string): Promise<void> {
    const members = await this.userRepository.count({
      where: { company: { id: companyId } },
    });
    if (members > 0) return;
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) return;
    await this.companyRepository.delete(companyId);
    if (company.logo) await deleteSingleImage(company.logo);
  }
}

/** What an admin verified; changing any of them drops `is_verified`. */
const VERIFIED_FIELDS = ['name', 'registration_number', 'tax_id'] as const;

const companyExists = () =>
  new ConflictException({
    code: 'COMPANY_EXISTS',
    message: 'This account already has a company',
  });
