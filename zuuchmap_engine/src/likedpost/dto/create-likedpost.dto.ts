import { IsOptional } from "class-validator"

export class CreateLikedpostDto {

    @IsOptional()
    user_id?: string

    @IsOptional()
    post_type?: string

    @IsOptional()
    post_id?: number

    @IsOptional()
    user?: string
}
