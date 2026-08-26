import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { ReportStatus } from '../enums/report';
import { EventsGateway } from '../events/events.gateway';

/**
 * One reporter may not file the same complaint about the same post twice —
 * a second identical report adds no information and only inflates the queue.
 */
const MAX_OPEN_PER_USER = 20;

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reports: Repository<Report>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly events: EventsGateway,
  ) {}

  async create(
    reporterId: string,
    postId: number,
    reason: string,
    detail?: string,
  ) {
    const post = await this.posts.findOne({
      where: { id: postId },
      relations: ['user'],
    });
    if (!post) throw new NotFoundException('Post not found');

    // Reporting your own listing is always a mistake or an attempt to game the
    // queue; either way an admin should not have to read it.
    if (post.user?.id === reporterId)
      throw new BadRequestException('CANNOT_REPORT_OWN_POST');

    const duplicate = await this.reports.findOne({
      where: {
        reporter: { id: reporterId },
        post: { id: postId },
        status: ReportStatus.OPEN,
      },
    });
    if (duplicate)
      return { id: duplicate.id, status: duplicate.status, duplicate: true };

    const open = await this.reports.count({
      where: { reporter: { id: reporterId }, status: ReportStatus.OPEN },
    });
    if (open >= MAX_OPEN_PER_USER)
      throw new BadRequestException('TOO_MANY_OPEN_REPORTS');

    const reporter = await this.users.findOne({ where: { id: reporterId } });
    const saved = await this.reports.save(
      this.reports.create({ reporter, post, reason, detail: detail ?? null }),
    );

    // Admins are already in the `admin` socket room for the approval queue;
    // a report is the same kind of work arriving, so it lands the same way.
    this.events.emitReportCreated({
      reportId: saved.id,
      postId: post.id,
      reason,
    });

    this.logger.log(`Report ${saved.id} filed on post ${postId} (${reason})`);
    return { id: saved.id, status: saved.status, duplicate: false };
  }

  /** The admin queue. Oldest first — the same drain-the-tail rule as pending posts. */
  async list(status = ReportStatus.OPEN, page = 1, limit = 50) {
    const take = Math.min(Math.max(Math.floor(limit) || 50, 1), 100);
    const skip = (Math.max(Math.floor(page) || 1, 1) - 1) * take;
    const [items, total] = await this.reports.findAndCount({
      where: { status },
      relations: ['post', 'reporter'],
      order: { date_created: 'ASC' },
      take,
      skip,
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        date_created: r.date_created,
        post: r.post
          ? {
              id: r.post.id,
              title: (r.post as any).title,
              approval_status: (r.post as any).approval_status,
            }
          : null,
        reporter: r.reporter
          ? { id: r.reporter.id, phone_number: r.reporter.phone_number }
          : null,
      })),
      total,
    };
  }

  async countOpen(): Promise<number> {
    return this.reports.count({ where: { status: ReportStatus.OPEN } });
  }

  async resolve(id: string, status: string, resolution?: string) {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    report.status = status;
    report.resolution = resolution ?? null;
    report.resolved_at = new Date();
    await this.reports.save(report);
    return { id: report.id, status: report.status };
  }
}
