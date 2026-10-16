import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ArrayMinSize } from 'class-validator';
import { DISTRICT_CODES, FAMILY_KEYS, PRICE_UNITS, PROVINCE_CODES, type BrowseSort, type PriceUnit, type BlockDaysRequest, type ContactRequest, type LikeRequest, type ListingWriteRequest, type MergeLikesRequest, type PhotoIntentRequest, type RejectListingRequest, type SavedSearchUpdateRequest, type SavedSearchWriteRequest } from '@zuuchmap/core';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BROWSE_SORTS: BrowseSort[] = ['relevance', 'newest', 'nearby', 'price_asc', 'price_desc'];

/** Photos per listing. */
export const MAX_PHOTOS = 10;
/** `posts/<owner uuid>/<uuid>.<ext>`: what PhotoStorage.createUploadIntent mints. */
export const PHOTO_KEY_RE = /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Fields shared by create and edit. Everything but `title` on create is optional; `null` clears. */
class ListingFieldsDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  subcategory?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  details?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(PROVINCE_CODES, { message: 'province must be a valid province code' })
  province?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(DISTRICT_CODES, { message: 'district must be a valid district code' })
  district?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  location?: string | null;

  /** numeric(15,2) ceiling, so an overflow is a 400 and not a 500. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9_999_999_999_999.99)
  price_amount?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(PRICE_UNITS, { message: 'INVALID_PRICE_UNIT' })
  price_unit?: PriceUnit | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(32)
  contact_phone?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsEmail()
  @MaxLength(320)
  contact_email?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  available_from?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  available_until?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  website?: string | null;

  /** EXPIRED is the system's; the owner toggles ACTIVE/RENTED. */
  @IsOptional()
  @IsIn(['ACTIVE', 'RENTED'])
  status?: 'ACTIVE' | 'RENTED';

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  /** Upload-intent keys. Ownership and existence are checked by the service. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(PHOTO_KEY_RE, { each: true, message: 'INVALID_PHOTO_KEY' })
  images?: string[];
}

export class CreateListingDto extends ListingFieldsDto implements ListingWriteRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** Save without submitting: no moderation, no quota. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

export class UpdateListingDto extends ListingFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  /** A draft: save these fields, then send it for review, in one request. */
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class RejectListingDto implements RejectListingRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(/^[a-z0-9_]{1,64}$/i, { message: 'INVALID_FIELD_KEY' })
  field_key?: string | null;
}

export class PhotoIntentDto implements PhotoIntentRequest {
  @IsIn(PHOTO_TYPES)
  content_type!: (typeof PHOTO_TYPES)[number];
}

/** `GET /posts` (core `ListingSearchParams`); `attr.*` filters are read off the raw query string. */
export class ListQueryDto {
  @IsOptional() @IsIn(FAMILY_KEYS) family?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(50) province?: string;
  @IsOptional() @IsString() @MaxLength(50) district?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** Inclusive `YYYY-MM-DD`; one end alone means that single day. */
  @IsOptional() @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) date_from?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) date_to?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(3000) radius_km?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(9_999_999_999_999.99) price_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(9_999_999_999_999.99) price_max?: number;
  /** Required with a price bound: the range applies within one unit only. */
  @ValidateIf((o: ListQueryDto) => o.price_min !== undefined || o.price_max !== undefined || o.price_unit !== undefined)
  @IsIn(PRICE_UNITS, { message: 'INVALID_PRICE_UNIT' })
  price_unit?: string;
  @IsOptional() @IsIn(BROWSE_SORTS) sort?: BrowseSort;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** `GET /posts/map`: the browse filters plus the viewport. */
export class MapQueryDto extends ListQueryDto {
  /** `west,south,east,north` in degrees. */
  @Matches(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, { message: 'bbox must be west,south,east,north' })
  bbox!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(22) zoom?: number;
}

export class AvailabilityQueryDto {
  @IsOptional() @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) from?: string;
  @IsOptional() @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) to?: string;
}

/** `POST /posts/availability/block`: one range on several of the caller's listings. */
export class BlockDaysDto implements BlockDaysRequest {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsInt({ each: true }) @Min(1, { each: true }) post_ids!: number[];
  @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) start_date!: string;
  @Matches(DATE_RE, { message: 'INVALID_DATE_RANGE' }) end_date!: string;
}

export class AdminListQueryDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) approval_status?: string;
  /** Figma J5: title, owner phone or category key. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class LikesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ContactDto implements ContactRequest {
  @IsIn(['CALL']) kind!: 'CALL';
}

export class PerformanceQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days?: number;
}

export class LikeDto implements LikeRequest {
  @IsInt() @Min(1) post_id!: number;
}

/** A guest's on-device saves, merged at sign-in. */
export class MergeLikesDto implements MergeLikesRequest {
  @IsArray() @ArrayMaxSize(500) @IsInt({ each: true }) @Min(1, { each: true }) post_ids!: number[];
}

/** The browse filters a saved search keeps (dates, location and paging are dropped by the service). */
export class SavedSearchParamsDto extends ListQueryDto {
  @IsOptional() @IsObject() attrs?: Record<string, string>;
}

export class CreateSavedSearchDto implements SavedSearchWriteRequest {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsObject() @ValidateNested() @Type(() => SavedSearchParamsDto) params!: SavedSearchParamsDto;
  @IsOptional() @IsBoolean() notify?: boolean;
}

export class UpdateSavedSearchDto implements SavedSearchUpdateRequest {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() notify?: boolean;
}

export class SimilarQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}
