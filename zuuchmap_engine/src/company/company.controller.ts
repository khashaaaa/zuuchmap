import { Controller, Get, Post, Body, Patch, Param, ForbiddenException, UseInterceptors, UploadedFile, UseGuards, Req } from '@nestjs/common';
import { CompanyService } from './company.service';
import { isAdmin } from '../admin/admin.guard';
import { publicCompany } from '../utils/public-user';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import {
  createCompanyLogoInterceptor,
  ImageUploadHandler
} from '../utils/uploader';

// No per-route try/catch: the global AllExceptionsFilter normalizes errors
// and keeps the machine-readable `code` field (e.g. COMPANY_FORBIDDEN) intact.
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) { }

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
      const compressedLogo = await ImageUploadHandler.handleSingleUpload(file, 'COMPANY_LOGO');
      if (compressedLogo) createCompanyDto.logo = compressedLogo;
    }

    return this.companyService.create(createCompanyDto);
  }

  /** Owner (user attached to the company) or admin only. */
  private assertCanManage(req: any, id: string): void {
    if (isAdmin(req.user?.phone_number)) return;
    if (req.user?.company?.id !== id) {
      throw new ForbiddenException({ code: 'COMPANY_FORBIDDEN', message: 'You can only manage your own company' });
    }
  }

  /** Unauthenticated — credentials stay out of the projection. */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return publicCompany(await this.companyService.findOne(id));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createCompanyLogoInterceptor())
  async update(
    @Req() req,
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertCanManage(req, id);
    if (file) {
      const compressedLogo = await ImageUploadHandler.handleSingleUpload(file, 'COMPANY_LOGO');
      if (compressedLogo) updateCompanyDto.logo = compressedLogo;
    }

    // Past assertCanManage, so this is the owner or an admin — the two callers
    // entitled to read back the registration number and tax ID they just saved.
    return publicCompany(await this.companyService.update(id, updateCompanyDto), { includePrivate: true });
  }
}
