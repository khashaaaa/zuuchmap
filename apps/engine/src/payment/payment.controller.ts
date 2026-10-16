import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  FEATURED_MAX_DAYS, PLAN_MONTHS, PaymentKind, Plan,
  type AdminFeatureGrantRequest, type AdminPlanGrantRequest, type InvoiceCreateRequest, type Payment, type PaymentCatalogue, type PaymentInvoice,
} from '@zuuchmap/core';
import { AdminGuard, CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { PaymentService } from './payment.service';

class InvoiceDto implements InvoiceCreateRequest {
  @IsIn(Object.values(PaymentKind)) kind!: PaymentKind;
  @IsOptional() @IsIn(Object.values(Plan)) plan?: Plan;
  @IsOptional() @Type(() => Number) @IsIn([...PLAN_MONTHS]) months?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) post_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(FEATURED_MAX_DAYS) days?: number;
}

class PlanGrantDto implements AdminPlanGrantRequest {
  @Type(() => Number) @IsIn([...PLAN_MONTHS]) months!: number;
}

class FeatureGrantDto implements AdminFeatureGrantRequest {
  @Type(() => Number) @IsInt() @Min(1) @Max(FEATURED_MAX_DAYS) days!: number;
}

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  /** Public: the upgrade and placement screens show prices before sign-in matters. */
  @Get('catalogue')
  catalogue(): PaymentCatalogue {
    return this.payments.catalogue();
  }

  /** QPay calls this unauthenticated; it only prompts a check. */
  @Get('callback/:id')
  @SkipThrottle()
  async callback(@Param('id') id: string): Promise<{ ok: true }> {
    await this.payments.callback(id);
    return { ok: true };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() me: RequestUser): Promise<Payment[]> {
    return this.payments.mine(me);
  }

  @Post('invoice')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  invoice(@CurrentUser() me: RequestUser, @Body() body: InvoiceDto): Promise<PaymentInvoice> {
    return this.payments.createInvoice(me, body);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  one(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentInvoice> {
    return this.payments.invoice(me, id);
  }

  /** A client polls this while the QR is on screen. */
  @Get(':id/status')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  status(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<Payment> {
    return this.payments.status(me, id);
  }

  @Post(':id/receipt')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  receipt(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.payments.resendReceipt(me, id);
  }
}

/** Figma J11d: plans and placement granted without payment. */
@Controller('admin')
@UseGuards(AdminGuard)
export class PaymentAdminController {
  constructor(private readonly payments: PaymentService) {}

  @Post('users/:id/plan')
  @HttpCode(200)
  grantPlan(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PlanGrantDto): Promise<Payment> {
    return this.payments.adminGrantPlan(me, id, body.months);
  }

  @Delete('users/:id/plan')
  revokePlan(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    return this.payments.adminRevokePlan(id);
  }

  @Post('posts/:id/feature')
  @HttpCode(200)
  grantFeatured(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: FeatureGrantDto): Promise<Payment> {
    return this.payments.adminGrantFeatured(me, id, body.days);
  }
}
