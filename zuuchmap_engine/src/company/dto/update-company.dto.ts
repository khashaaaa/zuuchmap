import { OmitType } from '@nestjs/mapped-types';
import { CreateCompanyDto } from './create-company.dto';

/**
 * Same bounded, type-checked fields as CreateCompanyDto (every one already
 * optional there), minus `userId` — the owner link is set once at creation.
 */
export class UpdateCompanyDto extends OmitType(CreateCompanyDto, [
  'userId',
] as const) {}
