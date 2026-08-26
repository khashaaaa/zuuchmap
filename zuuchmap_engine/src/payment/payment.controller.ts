import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle as ThrottleDecorator } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentService } from './payment.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  /** Public: the upgrade screen has to render prices before anyone signs in. */
  @Get('catalogue')
  catalogue() {
    return this.payments.catalogue();
  }

  /**
   * Every invoice is a round trip to QPay, so this is stingier than the global
   * default — a loop here costs upstream quota, not just our CPU.
   */
  @Post('invoice')
  @UseGuards(JwtAuthGuard)
  @ThrottleDecorator({ default: { limit: 10, ttl: 60000 } })
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req) {
    return this.payments.createInvoice(req.user.id, dto.plan, dto.months ?? 1);
  }

  /**
   * Poll while the QR is on screen. Scoped to the caller's own payments — the
   * id alone must not be enough to read someone else's invoice.
   */
  @Get(':id/check')
  @UseGuards(JwtAuthGuard)
  check(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.payments.check(id, req.user.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req) {
    return this.payments.mine(req.user.id);
  }

  /**
   * QPay's callback. Unauthenticated because QPay cannot hold a JWT, and
   * therefore never trusted: it only prompts the server-to-server check that
   * decides whether money actually moved.
   */
  @Get('callback/:id')
  @ThrottleDecorator({ default: { limit: 30, ttl: 60000 } })
  callback(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.handleCallback(id);
  }
}
