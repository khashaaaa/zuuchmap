import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSavedSearchDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  subcategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsObject()
  attrs?: Record<string, any>;
}
