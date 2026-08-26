import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PROVINCE_CODES,
  DISTRICT_CODES,
  normalizeLocationCode,
} from '../../enums/province';

export class UpdatePostDto {
  @IsOptional() @IsString() subcategory?: string;
  // Legacy alias for subcategory — accepted from older mobile builds
  @IsOptional() @IsString() secondcategory?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() details?: string;
  // See CreatePostDto — an unrecognised code is unrenderable and unfilterable.
  @IsOptional()
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsIn(PROVINCE_CODES, { message: 'province must be a valid province code' })
  province?: string;
  @IsOptional()
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsIn(DISTRICT_CODES, { message: 'district must be a valid district code' })
  district?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() location?: string;
  // See CreatePostDto — numeric(15,2) overflows at >= 10^13.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9_999_999_999_999.99)
  price_amount?: number;
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
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value;
  })
  attributes?: Record<string, any>;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  })
  existingImages?: string[];
}
