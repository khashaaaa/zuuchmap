import { Controller, Get, Post, Body, Patch, Param, Delete, ForbiddenException, UseInterceptors, UploadedFile, UseGuards, Req } from '@nestjs/common';
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

  @Get()
  async findAll() {
    return (await this.companyService.findAll()).map(publicCompany);
  }

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

    return publicCompany(await this.companyService.update(id, updateCompanyDto));
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req, @Param('id') id: string) {
    this.assertCanManage(req, id);
    await this.companyService.remove(id);
    return { message: `Company with ID ${id} successfully deleted` };
  }
}
