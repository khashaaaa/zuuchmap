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

/** Exactly one of `post_id` / `review_id` — checked in the service. */
export class CreateReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  post_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  review_id?: number;

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
