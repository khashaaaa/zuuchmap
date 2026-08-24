import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @Req() req) {
    return this.bookingService.create(req.user.id, dto);
  }

  @Get('mine')
  mine(@Req() req) {
    return this.bookingService.listForCustomer(req.user.id);
  }

  @Get('received')
  received(@Req() req) {
    return this.bookingService.listForProvider(req.user.id);
  }

  /** Taken date ranges for a post, so the booking form can block them. */
  @Get('post/:postId/busy')
  busy(@Param('postId', ParseIntPipe) postId: number) {
    return this.bookingService.busyRanges(postId);
  }

  @Put(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Body() body: { message?: string }, @Req() req) {
    return this.bookingService.respond(id, req.user.id, true, body?.message);
  }

  @Put(':id/decline')
  decline(@Param('id', ParseIntPipe) id: number, @Body() body: { message?: string }, @Req() req) {
    return this.bookingService.respond(id, req.user.id, false, body?.message);
  }

  @Put(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.bookingService.cancel(id, req.user.id);
  }
}
