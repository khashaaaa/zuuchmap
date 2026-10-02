import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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
  // Required: the column is NOT NULL, and a missing name surfaced as a raw
  // Postgres error. `\S` refuses a name of spaces alone.
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Server-set only, from the uploaded file — undecorated so the global
  // `forbidNonWhitelisted` pipe rejects it from a client. Accepted as text, it
  // let a member point the row at any object in the bucket, and the next logo
  // upload deleted that object as "the old logo".
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
