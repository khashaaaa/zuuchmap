import { IsOptional, IsString, IsNumber, IsEmail, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreatePostDto {
  @IsString()
  category: string;

  @IsOptional() @IsString()
  subcategory?: string;

  // Legacy alias for subcategory — accepted from older mobile builds
  @IsOptional() @IsString()
  secondcategory?: string;

  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  details?: string;

  @IsOptional() @IsString()
  province?: string;

  @IsOptional() @IsString()
  district?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  longitude?: number;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  price_amount?: number;

  @IsOptional() @IsString()
  price_unit?: string;

  @IsOptional() @IsString()
  contact_phone?: string;

  @IsOptional() @IsEmail()
  contact_email?: string;

  @IsOptional() @IsString()
  available_from?: string;

  @IsOptional() @IsString()
  available_until?: string;

  @IsOptional() @IsString()
  website?: string;

  @IsOptional() @IsString()
  status?: string;

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

  // NOTE: the post owner is NEVER taken from the request body. It is bound from
  // the authenticated JWT in the controller. A client-supplied `user` field
  // would let any authenticated caller attribute a post to another account, so
  // it is deliberately absent here and rejected by forbidNonWhitelisted.
}
