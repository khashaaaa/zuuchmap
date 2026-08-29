import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { REPORT_REASONS, ReportStatus } from '../enums/report';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  /** The closed reason list, so clients never hardcode it. */
  @Get('reasons')
  reasons() {
    return REPORT_REASONS;
  }

  /**
   * Filing is stingier than the global default. A report costs an admin
   * attention, which is the scarcest resource in the moderation loop, and the
   * per-user open cap in the service is the second line of the same defence.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(@Body() dto: CreateReportDto, @Req() req) {
    return this.reports.create(
      req.user.id,
      dto.post_id,
      dto.reason,
      dto.detail,
    );
  }

  @Get()
  @UseGuards(AdminGuard)
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('post_id') postId?: string,
  ) {
    const wanted =
      status && Object.values(ReportStatus).includes(status as ReportStatus)
        ? (status as ReportStatus)
        : ReportStatus.OPEN;
    return this.reports.list(
      wanted,
      Number(page) || 1,
      Number(limit) || 50,
      Number(postId) || undefined,
    );
  }

  /** Drives the badge on the admin nav — cheap enough to poll. */
  @Get('count')
  @UseGuards(AdminGuard)
  async count() {
    return { open: await this.reports.countOpen() };
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(id, dto.status, dto.resolution);
  }
}
