import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { MyBookingsTab, ReceivedBookingsTab, BookingAnswerRequest, BookingCreateRequest } from '@zuuchmap/core';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBookingDto implements BookingCreateRequest {
  @IsInt() @Min(1) post_id!: number;
  @Matches(DATE_RE) start_date!: string;
  @Matches(DATE_RE) end_date!: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  /** `HH:MM`, 24-hour. */
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start_time?: string;
}

export class BookingValueQueryDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

export class AnswerBookingDto implements BookingAnswerRequest {
  @IsOptional() @IsString() @MaxLength(1000) response_message?: string;
}

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class MyBookingsQueryDto extends PageDto {
  @IsOptional() @IsIn(['active', 'past']) tab?: MyBookingsTab;
}

export class ReceivedBookingsQueryDto extends PageDto {
  @IsOptional() @IsIn(['new', 'accepted', 'past']) tab?: ReceivedBookingsTab;
}
