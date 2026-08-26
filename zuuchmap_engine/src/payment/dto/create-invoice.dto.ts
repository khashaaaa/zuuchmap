import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Plan } from '../../enums/plan';

export class CreateInvoiceDto {
  /**
   * Only paid plans are purchasable. FREE is what you get by lapsing, not
   * something you buy — accepting it here would open a zero-tögrög invoice.
   */
  @IsIn([Plan.PROVIDER])
  plan: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number;
}
