import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpenConversationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  post_id: number;

  /**
   * Optional opening line. Opening an empty thread and sending separately
   * works too, but the first message is the whole point of tapping "message"
   * and a thread with nothing in it is noise in the provider's inbox.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
