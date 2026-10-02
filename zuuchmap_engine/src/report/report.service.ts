import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Report } from './entities/report.entity';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { Review } from '../review/entities/review.entity';
import { ReportKind, ReportStatus } from '../enums/report';
import { EventsGateway } from '../events/events.gateway';
import {
  PostNotificationService,
  REPORT_REASON_LABELS_MN,
} from '../post/post-notification.service';
import { AdminService } from '../admin/admin.service';
import { CreateReportDto } from './dto/create-report.dto';
import { closeOpenReports, notifyReporters } from './close-open-reports';

/**
 * One reporter may not file the same complaint about the same post twice —
 * a second identical report adds no information and only inflates the queue.
 */
const MAX_OPEN_PER_USER = 20;

const isUniqueViolation = (err: any) => err?.code === '23505';

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
    @InjectRepository(Review)
    private readonly reviews: Repository<Review>,
    private readonly events: EventsGateway,
    private readonly notifications: PostNotificationService,
    private readonly admin: AdminService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if ((dto.post_id == null) === (dto.review_id == null))
      throw new BadRequestException('REPORT_NEEDS_ONE_SUBJECT');

    let fields: Partial<Report>;
    let subjectWhere: FindOptionsWhere<Report>;
    let postId: number | null = null;

    if (dto.review_id != null) {
      const review = await this.reviews.findOne({
        where: { id: dto.review_id },
        relations: ['author'],
      });
      if (!review) throw new NotFoundException('Review not found');
      if (review.author?.id === reporterId)
        throw new BadRequestException('CANNOT_REPORT_OWN_REVIEW');
      fields = {
        kind: ReportKind.REVIEW,
        review,
        owner: review.author,
        subject: `${review.rating}★${review.comment ? ` · ${review.comment}` : ''}`,
      };
      subjectWhere = { review: { id: review.id } };
    } else {
      const post = await this.posts.findOne({
        where: { id: dto.post_id },
        relations: ['user'],
      });
      if (!post) throw new NotFoundException('Post not found');
      // Reporting your own listing is always a mistake or an attempt to game
      // the queue; either way an admin should not have to read it.
      if (post.user?.id === reporterId)
        throw new BadRequestException('CANNOT_REPORT_OWN_POST');
      fields = {
        kind: ReportKind.POST,
        post,
        owner: post.user ?? null,
        subject: post.title ?? null,
      };
      subjectWhere = { post: { id: post.id } };
      postId = post.id;
    }

    const findDuplicate = () =>
      this.reports.findOne({
        where: {
          ...subjectWhere,
          reporter: { id: reporterId },
          status: ReportStatus.OPEN,
        },
      });
    const asDuplicate = (r: Report) => ({
      id: r.id,
      status: r.status,
      duplicate: true,
    });

    const existing = await findDuplicate();
    if (existing) return asDuplicate(existing);

    const open = await this.reports.count({
      where: { reporter: { id: reporterId }, status: ReportStatus.OPEN },
    });
    if (open >= MAX_OPEN_PER_USER)
      throw new BadRequestException('TOO_MANY_OPEN_REPORTS');

    // The partial unique index (one OPEN report per reporter per subject) is
    // the guard; the read above only spares the common case an exception.
    let saved: Report;
    try {
      saved = await this.reports.save(
        this.reports.create({
          ...fields,
          reporter: { id: reporterId } as User,
          reason: dto.reason,
          detail: dto.detail ?? null,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await findDuplicate();
      if (raced) return asDuplicate(raced);
      throw err;
    }

    // Admins are already in the `admin` socket room for the approval queue;
    // a report is the same kind of work arriving, so it lands the same way.
    this.events.emitReportCreated({
      reportId: saved.id,
      postId,
      reason: dto.reason,
    });
    // The socket only reaches an admin who is connected right now. A report is
    // a complaint about something already live, so it must also reach the one
    // who is not — pending posts already get a push; reports get the same.
    void this.notifications.notifyAdminsOfReport(
      postId,
      fields.subject ?? '',
      dto.reason,
    );

    this.logger.log(
      `Report ${saved.id} filed on ${fields.kind} ${postId ?? dto.review_id} (${dto.reason})`,
    );
    return { id: saved.id, status: saved.status, duplicate: false };
  }

  /** The admin queue. Oldest first — the same drain-the-tail rule as pending posts. */
  async list(
    status = ReportStatus.OPEN,
    page = 1,
    limit = 50,
    postId?: number,
  ) {
    const take = Math.min(Math.max(Math.floor(limit) || 50, 1), 100);
    const skip = (Math.max(Math.floor(page) || 1, 1) - 1) * take;
    const [items, total] = await this.reports.findAndCount({
      where: postId ? { status, post: { id: postId } } : { status },
      relations: ['post', 'reporter', 'review', 'owner'],
      order: { date_created: 'ASC' },
      take,
      skip,
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        kind: r.kind,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        resolution: r.resolution,
        date_created: r.date_created,
        // What was filed against, as it read then — still there after a delete.
        subject: r.subject,
        post: r.post
          ? {
              id: r.post.id,
              title: r.post.title,
              approval_status: r.post.approval_status,
            }
          : null,
        review: r.review
          ? {
              id: r.review.id,
              rating: r.review.rating,
              comment: r.review.comment,
            }
          : null,
        owner: r.owner
          ? { id: r.owner.id, phone_number: r.owner.phone_number }
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

  /**
   * Record a verdict, and with `take_down` act on it: an upheld listing report
   * rejects the whole listing (a pending edit included), an upheld review
   * report deletes the review. Either way every other open report on the same
   * subject closes with it, and each reporter is told the outcome.
   */
  async resolve(
    id: string,
    status: ReportStatus.RESOLVED | ReportStatus.DISMISSED,
    resolution?: string,
    takeDown = false,
  ) {
    const note = resolution?.trim() || null;
    // A verdict is written once. One conditional UPDATE claims the report, so
    // two admins acting at the same moment cannot both pass a read-then-write
    // check and have the second silently overwrite the first.
    const claimed = await this.reports
      .createQueryBuilder()
      .update()
      .set({ status, resolution: note, resolved_at: () => 'NOW()' })
      .where('id = :id AND status = :open', { id, open: ReportStatus.OPEN })
      .execute();
    if (!claimed.affected) {
      const exists = await this.reports.exists({ where: { id } });
      if (!exists) throw new NotFoundException('Report not found');
      throw new BadRequestException('REPORT_ALREADY_RESOLVED');
    }

    const report = await this.reports.findOneOrFail({
      where: { id },
      relations: ['post', 'review', 'reporter'],
    });
    if (report.reporter)
      void notifyReporters(this.notifications, [report.reporter.id], status);

    if (status !== ReportStatus.RESOLVED || !takeDown)
      return { id: report.id, status: report.status };

    if (report.post) {
      // rejectPost closes the listing's other open reports itself, so a
      // rejection from the approval screen does the same.
      await this.admin.rejectPost(
        report.post.id,
        note ?? REPORT_REASON_LABELS_MN[report.reason] ?? report.reason,
        null,
        { wholeListing: true },
      );
    } else if (report.review) {
      const reviewId = report.review.id;
      await closeOpenReports(
        this.reports,
        this.notifications,
        { review: { id: reviewId } },
        ReportStatus.RESOLVED,
        note,
      );
      await this.reviews.delete(reviewId);
    }
    return { id: report.id, status: report.status, taken_down: true };
  }
}
