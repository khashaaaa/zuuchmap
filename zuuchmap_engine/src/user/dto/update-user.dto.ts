import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Every field here lands in `Object.assign(user, dto)` in UserService.update,
 * so this DTO is the only thing between the request body and the row.
 *
 * `@IsOptional()` on its own — which is all these carried — whitelists a
 * property without checking anything about it: a non-string, an unbounded
 * string, or a `type` outside the enum all reached the column. `type` is not
 * here at all: the role is set once, through `POST /user/type`, and this route
 * accepting it was a way around that lock (the whitelist strips it now).
 *
 * Blank is "clear this field" and stays legal — the app submits `''` for an
 * emptied input — so the format check runs only on a non-empty value.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  parent_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  given_name?: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '' && o.email !== null)
  @IsString()
  @MaxLength(320)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  // Server-set: the controller overwrites this from the uploaded file. Kept on
  // the DTO so that assignment type-checks, and bounded so a client that sends
  // one anyway cannot store an arbitrary blob as an image key.
  @IsOptional()
  @IsString()
  @MaxLength(512)
  profile_picture?: string;
}
