import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdatePostDto {
  @IsOptional() @IsString() subcategory?: string;
  // Legacy alias for subcategory — accepted from older mobile builds
  @IsOptional() @IsString() secondcategory?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() details?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price_amount?: number;
  @IsOptional() @IsString() price_unit?: string;
  @IsOptional() @IsString() contact_phone?: string;
  @IsOptional() @IsString() contact_email?: string;
  @IsOptional() @IsString() available_from?: string;
  @IsOptional() @IsString() available_until?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() status?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return {}; }
    }
    return value;
  })
  attributes?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    return value;
  })
  existingImages?: string[];
}
