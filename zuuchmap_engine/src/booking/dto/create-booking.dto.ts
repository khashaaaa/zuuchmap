import { IsInt, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @Type(() => Number) @IsInt()
  post_id: number;

  @IsISO8601()
  start_date: string;

  @IsISO8601()
  end_date: string;

  @IsOptional() @IsString() @MaxLength(1000)
  message?: string;
}
