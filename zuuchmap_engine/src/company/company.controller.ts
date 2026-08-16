import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, HttpException, UseInterceptors, UploadedFile, UseGuards, Req } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import {
  createCompanyLogoInterceptor,
  ImageUploadHandler
} from '../utils/uploader';

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
    try {
      createCompanyDto.userId = req.user.id;

      if (file) {
        const compressedLogo = await ImageUploadHandler.handleSingleUpload(file, 'COMPANY_LOGO');
        if (compressedLogo) createCompanyDto.logo = compressedLogo;
      }

      return await this.companyService.create(createCompanyDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create company',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async findAll() {
    try {
      return await this.companyService.findAll();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve companies',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.companyService.findOne(id);
    } catch (error) {
      throw new HttpException(
        error.message || `Failed to retrieve company with ID ${id}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createCompanyLogoInterceptor())
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      if (file) {
        const compressedLogo = await ImageUploadHandler.handleSingleUpload(file, 'COMPANY_LOGO');
        if (compressedLogo) updateCompanyDto.logo = compressedLogo;
      }

      return await this.companyService.update(id, updateCompanyDto);
    } catch (error) {
      throw new HttpException(
        error.message || `Failed to update company with ID ${id}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    try {
      await this.companyService.remove(id);
      return { message: `Company with ID ${id} successfully deleted` };
    } catch (error) {
      throw new HttpException(
        error.message || `Failed to delete company with ID ${id}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
