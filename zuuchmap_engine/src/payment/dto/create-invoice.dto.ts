import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Plan } from '../../enums/plan';
import { PaymentKind } from '../../enums/payment';
import { MAX_FEATURED_DAYS } from '../../post/featured';

export class CreateInvoiceDto {
  /**
   * Which product. Optional and defaulting to PLAN so the clients that shipped
   * before placement was sellable keep working unchanged — they post
   * `{plan, months}` and mean a plan.
   */
  @IsOptional()
  @IsIn([PaymentKind.PLAN, PaymentKind.FEATURED])
  kind?: string;

  /**
   * Only paid plans are purchasable. FREE is what you get by lapsing, not
   * something you buy — accepting it here would open a zero-tögrög invoice.
   */
  @ValidateIf((o) => o.kind !== PaymentKind.FEATURED)
  @IsIn([Plan.PROVIDER])
  plan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number;

  /** The listing to feature. Required for, and only meaningful to, FEATURED. */
  @ValidateIf((o) => o.kind === PaymentKind.FEATURED)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  post_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FEATURED_DAYS)
  days?: number;
}
