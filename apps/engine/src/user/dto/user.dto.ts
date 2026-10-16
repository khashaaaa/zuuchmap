import { IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { SetRoleRequest, UpdateProfileRequest } from '@zuuchmap/core';

/** `null` or `''` clears a field; the format check runs only on a non-empty value. */
export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  given_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parent_name?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateProfileDto) => o.email !== '' && o.email !== null)
  @IsString()
  @MaxLength(320)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

export class SetRoleDto implements SetRoleRequest {
  @IsIn(['PROVIDER', 'CUSTOMER'])
  type!: 'PROVIDER' | 'CUSTOMER';
}
