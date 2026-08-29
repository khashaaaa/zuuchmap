import { IsOptional } from 'class-validator';
import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { CreatePostDto } from './create-post.dto';

/**
 * CreatePostDto minus `category` (immutable after creation), plus
 * `existingImages`. Every other field keeps the create-side rules — length
 * caps, coordinate bounds, @IsEmail — because an edit that could store what a
 * create refuses is a hole, not a leniency: every renderer downstream assumes
 * the create-time bounds.
 */
export class UpdatePostDto extends OmitType(CreatePostDto, ['category'] as const) {

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  })
  existingImages?: string[];
}
