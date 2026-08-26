import { ReportService } from './report.service';
import { ReportStatus } from '../enums/report';

/**
 * The report queue is admin attention, which is the scarcest thing in the
 * moderation loop. Everything here is about not spending it twice on the same
 * complaint, or on a complaint that is really an argument with yourself.
 */
describe('ReportService', () => {
  const makeService = (
    overrides: { duplicate?: any; openCount?: number; post?: any } = {},
  ) => {
    const reports: any = {
      findOne: jest.fn(async () => overrides.duplicate ?? null),
      count: jest.fn(async () => overrides.openCount ?? 0),
      save: jest.fn(async (row: any) => ({
        ...row,
        id: 'rep-1',
        status: ReportStatus.OPEN,
      })),
      create: jest.fn((row: any) => row),
      findAndCount: jest.fn(async () => [[], 0]),
    };
    const posts: any = {
      findOne: jest.fn(async () =>
        overrides.post === undefined
          ? { id: 5, user: { id: 'owner-1' } }
          : overrides.post,
      ),
    };
    const users: any = { findOne: jest.fn(async () => ({ id: 'reporter-1' })) };
    const events: any = { emitReportCreated: jest.fn() };
    const svc = new ReportService(reports, posts, users, events);
    return { svc, reports, events };
  };

  it('files a report and puts it in front of the admins immediately', async () => {
    const { svc, events } = makeService();

    const result = await svc.create(
      'reporter-1',
      5,
      'SCAM',
      'urid tolboroo neh bain',
    );

    expect(result).toMatchObject({
      duplicate: false,
      status: ReportStatus.OPEN,
    });
    expect(events.emitReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 5, reason: 'SCAM' }),
    );
  });

  // Filing the same complaint again adds no information and costs a second read.
  it('returns the existing report instead of queueing a duplicate', async () => {
    const { svc, reports, events } = makeService({
      duplicate: { id: 'rep-existing', status: ReportStatus.OPEN },
    });

    const result = await svc.create('reporter-1', 5, 'SCAM');

    expect(result).toEqual({
      id: 'rep-existing',
      status: ReportStatus.OPEN,
      duplicate: true,
    });
    expect(reports.save).not.toHaveBeenCalled();
    expect(events.emitReportCreated).not.toHaveBeenCalled();
  });

  it('refuses a report on your own listing', async () => {
    const { svc } = makeService({
      post: { id: 5, user: { id: 'reporter-1' } },
    });
    await expect(svc.create('reporter-1', 5, 'SPAM')).rejects.toThrow(
      'CANNOT_REPORT_OWN_POST',
    );
  });

  it('caps how much of the queue one account can occupy', async () => {
    const { svc } = makeService({ openCount: 20 });
    await expect(svc.create('reporter-1', 5, 'SPAM')).rejects.toThrow(
      'TOO_MANY_OPEN_REPORTS',
    );
  });

  it('404s on a listing that does not exist', async () => {
    const { svc } = makeService({ post: null });
    await expect(svc.create('reporter-1', 999, 'SPAM')).rejects.toThrow();
  });

  // Oldest first, same drain-the-tail rule the pending-post queue uses — a
  // newest-first queue starves the reports nobody got to.
  it('drains the queue oldest first', async () => {
    const { svc, reports } = makeService();
    await svc.list();
    expect(reports.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { date_created: 'ASC' } }),
    );
  });
});
