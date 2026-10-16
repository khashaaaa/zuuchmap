import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { LogoutRequest, VerifyStartRequest, VerifyStatusRequest } from '@zuuchmap/core';

export class VerifyStartDto implements VerifyStartRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone_number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  device_id?: string;
}

export class VerifyStatusDto implements VerifyStatusRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  session_id!: string;
}

export class LogoutDto implements LogoutRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  device_id?: string;
}
