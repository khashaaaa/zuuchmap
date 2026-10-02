import { IsIn, IsOptional } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDto } from './create-company.dto';

/**
 * Same bounded, type-checked fields as CreateCompanyDto, every one optional
 * (a present `name` must still be non-blank), minus `userId` — the owner link
 * is set once at creation.
 */
export class UpdateCompanyDto extends PartialType(
  OmitType(CreateCompanyDto, ['userId'] as const),
) {
  // Multipart, so a string. Clears the logo; ignored when a new one is uploaded.
  @IsOptional()
  @IsIn(['true', 'false'])
  remove_logo?: string;
}
