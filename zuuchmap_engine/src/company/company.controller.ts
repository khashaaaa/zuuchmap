import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { isAdmin } from '../admin/admin.guard';
import { publicCompany } from '../utils/public-user';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import {
  createCompanyLogoInterceptor,
  deleteSingleImage,
  handleSingleUpload,
} from '../utils/uploader';

// No per-route try/catch: the global AllExceptionsFilter normalizes errors
// and keeps the machine-readable `code` field (e.g. COMPANY_FORBIDDEN) intact.
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createCompanyLogoInterceptor())
  async create(
    @Req() req,
    @Body() createCompanyDto: CreateCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    createCompanyDto.userId = req.user.id;

    if (file) {
      const compressedLogo = await handleSingleUpload(
        file,
        'COMPANY_LOGO',
      );
      if (compressedLogo) createCompanyDto.logo = compressedLogo;
    }

    try {
      return await this.companyService.create(createCompanyDto);
    } catch (error) {
      // Refused (not a provider, already has a company) or failed: the logo
      // just uploaded belongs to nothing.
      if (createCompanyDto.logo) await deleteSingleImage(createCompanyDto.logo);
      throw error;
    }
  }

  /** Owner (user attached to the company) or admin only. */
  private async assertCanManage(req: any, id: string): Promise<void> {
    if (isAdmin(req.user?.phone_number)) return;
    if (!(await this.companyService.isMember(req.user?.id, id))) {
      throw new ForbiddenException({
        code: 'COMPANY_FORBIDDEN',
        message: 'You can only manage your own company',
      });
    }
  }

  /**
   * Public, but the credentials (registration number, tax ID) go only to a
   * member or an admin — the owner's own edit form reads them from here, and
   * stripping them for everyone made a saved value look lost.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findOne(@Req() req, @Param('id', ParseUUIDPipe) id: string) {
    const company = await this.companyService.findOne(id);
    const includePrivate =
      !!req.user &&
      (isAdmin(req.user.phone_number) ||
        (company.users ?? []).some((u) => u.id === req.user.id));
    return publicCompany(company, { includePrivate });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createCompanyLogoInterceptor())
  async update(
    @Req() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.assertCanManage(req, id);
    if (file) {
      const compressedLogo = await handleSingleUpload(
        file,
        'COMPANY_LOGO',
      );
      if (compressedLogo) updateCompanyDto.logo = compressedLogo;
    }

    let company;
    try {
      company = await this.companyService.update(id, updateCompanyDto);
    } catch (error) {
      if (updateCompanyDto.logo) await deleteSingleImage(updateCompanyDto.logo);
      throw error;
    }
    // Past assertCanManage, so this is the owner or an admin — the two callers
    // entitled to read back the registration number and tax ID they just saved.
    return publicCompany(company, { includePrivate: true });
  }
}
