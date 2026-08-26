import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { REPORT_REASONS } from '../../enums/report';

export class CreateReportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  post_id: number;

  @IsIn(REPORT_REASONS)
  reason: string;

  /**
   * Bounded: this is free text from an unverified reporter that an admin will
   * read, and the only thing an unbounded column buys is a way to fill the disk.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
