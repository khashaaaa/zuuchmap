import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '../../enums/report';

export class ResolveReportDto {
  @IsIn([ReportStatus.RESOLVED, ReportStatus.DISMISSED])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;
}
