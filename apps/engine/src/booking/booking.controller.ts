import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { Booking, BookingList, BookingValue, MyBookingsTab, ReceivedBookingsTab } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { AnswerBookingDto, BookingValueQueryDto, CreateBookingDto, MyBookingsQueryDto, ReceivedBookingsQueryDto } from './booking.dto';
import { BookingService } from './booking.service';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: RequestUser, @Body() body: CreateBookingDto): Promise<Booking> {
    return this.bookings.create(me, body);
  }

  @Get('mine')
  mine(@CurrentUser() me: RequestUser, @Query() q: MyBookingsQueryDto): Promise<BookingList<MyBookingsTab>> {
    return this.bookings.mine(me, q.tab ?? 'active', q.page, q.limit);
  }

  @Get('received')
  received(@CurrentUser() me: RequestUser, @Query() q: ReceivedBookingsQueryDto): Promise<BookingList<ReceivedBookingsTab>> {
    return this.bookings.received(me, q.tab ?? 'new', q.page, q.limit);
  }

  @Get('value')
  value(@CurrentUser() me: RequestUser, @Query() q: BookingValueQueryDto): Promise<BookingValue> {
    return this.bookings.value(me, q.month);
  }

  @Get(':id')
  get(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<Booking> {
    return this.bookings.get(me, id);
  }

  @Put(':id/accept')
  accept(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: AnswerBookingDto): Promise<Booking> {
    return this.bookings.accept(me, id, body.response_message);
  }

  @Put(':id/decline')
  decline(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: AnswerBookingDto): Promise<Booking> {
    return this.bookings.decline(me, id, body.response_message);
  }

  @Put(':id/cancel')
  cancel(@CurrentUser() me: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<Booking> {
    return this.bookings.cancel(me, id);
  }
}
