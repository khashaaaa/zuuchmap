import { IsOptional, IsUUID } from "class-validator";

export class CreateCompanyDto {

  @IsOptional()
  name?: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  logo?: string;

  @IsOptional()
  website?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  phone_number?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  registration_number?: string;

  @IsOptional()
  tax_id?: string;

  @IsOptional()
  is_verified?: boolean;

  @IsUUID()
  @IsOptional()
  userId?: string
}
