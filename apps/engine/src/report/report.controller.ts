import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  REPORT_ACTIONS, REPORT_REASONS, ReportKind,
  type Paginated, type ReportAction, type ReportCreateRequest, type ReportGroup, type ReportReason, type ReportResolveRequest,
} from '@zuuchmap/core';
import { AdminGuard, CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { RequestUser } from '../auth/request-user';
import { ReportService } from './report.service';

class CreateReportDto implements ReportCreateRequest {
  @IsIn(Object.values(ReportKind)) kind!: ReportKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) post_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) review_id?: number;
  @IsIn(REPORT_REASONS) reason!: ReportReason;
  @IsOptional() @IsString() @MaxLength(1000) detail?: string;
}

class ResolveReportDto implements ReportResolveRequest {
  @IsIn(REPORT_ACTIONS) action!: ReportAction;
  @IsOptional() @IsString() @MaxLength(1000) resolution?: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: RequestUser, @Body() body: CreateReportDto): Promise<{ id: string }> {
    return this.reports.create(me, body);
  }
}

@Controller('admin/reports')
@UseGuards(AdminGuard)
export class ReportAdminController {
  constructor(private readonly reports: ReportService) {}

  /** `?status=OPEN|CLOSED` (Figma J4 tabs "Шийдвэрлээгүй" / "Шийдвэрлэсэн"). */
  @Get()
  list(
    @Query('status', new DefaultValuePipe('OPEN')) status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<Paginated<ReportGroup>> {
    return this.reports.list(status === 'CLOSED' ? 'CLOSED' : 'OPEN', Math.max(1, page));
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() me: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ResolveReportDto): Promise<{ ok: true; closed: number }> {
    return this.reports.resolve(me, id, body.action, body.resolution);
  }
}
