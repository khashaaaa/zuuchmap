import {
  IsOptional,
  IsString,
  IsNumber,
  IsEmail,
  Min,
  Max,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PROVINCE_CODES,
  DISTRICT_CODES,
  normalizeLocationCode,
} from '../../enums/province';

export class CreatePostDto {
  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  // Legacy alias for subcategory — accepted from older mobile builds
  @IsOptional()
  @IsString()
  secondcategory?: string;

  // Bounded because `details` and `title` are the largest free-text surface in
  // the product and the columns are unbounded `varchar`/`text`. The caps are
  // roughly 30x the longest value in the table, so they constrain abuse without
  // reaching any real listing.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string;

  // Validated against the shared code list: an unknown value renders as a raw
  // code on every client and is invisible to the province filter, so it must
  // not reach the table. Legacy underscore spellings are folded in on the way.
  @IsOptional()
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsIn(PROVINCE_CODES, { message: 'province must be a valid province code' })
  province?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeLocationCode(value))
  @IsIn(DISTRICT_CODES, { message: 'district must be a valid district code' })
  district?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  location?: string;

  // `price_amount` is numeric(15,2) — Postgres raises "numeric field overflow"
  // at >= 10^13, which would surface as a 500 instead of a validation error.
  // The cap is the column's own ceiling, not a product judgement about price.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9_999_999_999_999.99)
  price_amount?: number;

  @IsOptional()
  @IsString()
  price_unit?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  available_from?: string;

  @IsOptional()
  @IsString()
  available_until?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  status?: string;

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

  // NOTE: the post owner is NEVER taken from the request body. It is bound from
  // the authenticated JWT in the controller. A client-supplied `user` field
  // would let any authenticated caller attribute a post to another account, so
  // it is deliberately absent here and rejected by forbidNonWhitelisted.
}
