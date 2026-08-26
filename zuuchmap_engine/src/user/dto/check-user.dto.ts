import { IsString, Matches } from 'class-validator';

/**
 * `POST /user/check` previously took `@Body() body: { phone_number: string }` —
 * a bare TypeScript annotation, which the global ValidationPipe cannot see. No
 * DTO class meant no validation and no whitelist, so any body shape passed and
 * a non-string reached the TypeORM `where` clause untouched.
 *
 * The format is the same 8-digit national number both clients validate before
 * sending, so anything else is not a lookup worth performing.
 */
export class CheckUserDto {
  @IsString()
  @Matches(/^\d{8}$/, { message: 'phone_number must be 8 digits' })
  phone_number: string;
}
