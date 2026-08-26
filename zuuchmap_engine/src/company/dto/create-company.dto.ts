import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Bounded and type-checked because CompanyService assigns these straight onto
 * the entity, and the columns carry no length cap of their own. Previously every
 * field was `@IsOptional()` alone, which whitelists a property while checking
 * nothing about it — a non-string or a megabyte of text reached the row intact.
 */
export class CreateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Server-set from the uploaded file; bounded so a client cannot store an
  // arbitrary blob as an image key.
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logo?: string;

  // Kept a plain bounded string rather than @IsUrl: both clients run it through
  // normalizeWebsiteUrl, which forces an http(s) scheme onto anything that
  // lacks one — that is what neutralises a `javascript:` value before it ever
  // reaches an href, and @IsUrl would additionally reject inputs the product
  // has always accepted.
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone_number?: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '' && o.email !== null)
  @IsString()
  @MaxLength(320)
  @IsEmail()
  email?: string;

  // An admin checks this against the state register before granting
  // Company.is_verified, so it must be a short opaque token, not free text.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  registration_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tax_id?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
