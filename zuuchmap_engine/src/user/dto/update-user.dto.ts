import { IsOptional } from "class-validator"

export class UpdateUserDto {

  @IsOptional()
  type?: string

  @IsOptional()
  parent_name?: string

  @IsOptional()
  given_name?: string

  @IsOptional()
  email?: string

  @IsOptional()
  address?: string

  @IsOptional()
  profile_picture?: string

  @IsOptional()
  company?: string
}
