import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PROVINCE_CODES, type Company, type MyCompanyResponse, type CompanyWriteRequest } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { CompanyService } from './company.service';

const nullable = ValidateIf((_o, v) => v !== null && v !== '');

class CompanyUpdateDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) name?: string;
  @IsOptional() @nullable @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @nullable @IsString() @MaxLength(200) website?: string | null;
  @IsOptional() @nullable @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @nullable @Matches(/^\d{8}$/) phone_number?: string | null;
  @IsOptional() @nullable @IsEmail() @MaxLength(320) email?: string | null;
  @IsOptional() @nullable @Matches(/^\d{7}$/) registration_number?: string | null;
  @IsOptional() @nullable @Matches(/^\d{7,12}$/) tax_id?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(22) @IsIn(PROVINCE_CODES, { each: true }) service_area?: string[];
}

class CompanyCreateDto extends CompanyUpdateDto implements CompanyWriteRequest {
  @IsString() @Matches(/\S/) @MaxLength(120) declare name: string;
}

@Controller('company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @Get('mine')
  async mine(@CurrentUser() me: RequestUser): Promise<MyCompanyResponse> {
    return { company: await this.companies.mine(me) };
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: RequestUser, @Body() body: CompanyCreateDto): Promise<Company> {
    return this.companies.create(me, body);
  }

  @Patch()
  update(@CurrentUser() me: RequestUser, @Body() body: CompanyUpdateDto): Promise<Company> {
    return this.companies.update(me, body);
  }
}
