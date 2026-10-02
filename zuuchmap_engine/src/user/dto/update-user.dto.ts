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

  // Server-set only, from the uploaded file. Deliberately undecorated, so the
  // global `forbidNonWhitelisted` pipe rejects it from a client: accepted as
  // text, it let anyone point their row at another object's key and have the
  // next upload delete that object as "the old picture".
  profile_picture?: string;
}
