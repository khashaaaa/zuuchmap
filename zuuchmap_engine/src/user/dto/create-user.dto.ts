import { IsOptional } from "class-validator"

export class CreateUserDto {

  @IsOptional()
  type?: string

  @IsOptional()
  phone_number?: string

  @IsOptional()
  parent_name?: string

  @IsOptional()
  given_name?: string

  @IsOptional()
  email?: string

  @IsOptional()
  address?: string

  @IsOptional()
  biometric?: string

  @IsOptional()
  device_info?: string

  @IsOptional()
  is_verified?: boolean

  @IsOptional()
  profile_picture?: string

  @IsOptional()
  company?: string
}
