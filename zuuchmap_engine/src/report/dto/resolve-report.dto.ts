import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportStatus } from '../../enums/report';

export class ResolveReportDto {
  @IsIn([ReportStatus.RESOLVED, ReportStatus.DISMISSED])
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;

  /** With RESOLVED: reject the listing, or delete the review, as well. */
  @IsOptional()
  @IsBoolean()
  take_down?: boolean;
}
