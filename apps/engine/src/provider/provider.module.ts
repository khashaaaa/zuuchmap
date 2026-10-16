import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import type { ProviderHome } from '@zuuchmap/core';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { BookingModule } from '../booking/booking.module';
import { CompanyModule } from '../company/company.module';
import { PeopleModule } from '../people/people.module';
import { PostModule } from '../post/post.module';
import { ProviderService } from './provider.service';

@Controller('provider')
@UseGuards(JwtAuthGuard)
export class ProviderController {
  constructor(private readonly provider: ProviderService) {}

  @Get('home')
  home(@CurrentUser() me: RequestUser): Promise<ProviderHome> {
    return this.provider.home(me);
  }
}

@Module({
  imports: [PostModule, BookingModule, PeopleModule, CompanyModule],
  controllers: [ProviderController],
  providers: [ProviderService],
})
export class ProviderModule {}
