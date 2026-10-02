import { FindOptionsWhere, Repository } from 'typeorm';
import { Report } from './entities/report.entity';
import { ReportStatus } from '../enums/report';
import { PostNotificationService } from '../post/post-notification.service';
import { PUSH } from '../utils/push-messages';

/**
 * Close every OPEN report matching `where` with one verdict and tell each
 * reporter. Shared by a take-down here and a listing rejection in
 * AdminService — whichever way the admin acts, the other complaints about the
 * same thing leave the queue with it, and the people who filed them hear.
 */
export async function closeOpenReports(
  reports: Repository<Report>,
  notifications: PostNotificationService,
  where: FindOptionsWhere<Report>,
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED,
  resolution: string | null,
): Promise<void> {
  const open = await reports.find({
    where: { ...where, status: ReportStatus.OPEN },
    relations: ['reporter'],
  });
  if (!open.length) return;
  const closed = await reports
    .createQueryBuilder()
    .update()
    .set({ status, resolution, resolved_at: () => 'NOW()' })
    .whereInIds(open.map((r) => r.id))
    .andWhere('status = :open', { open: ReportStatus.OPEN })
    .returning(['id', 'reporterId'])
    .execute();
  const reporterIds = [
    ...new Set(
      (closed.raw as { reporterId: string | null }[])
        .map((r) => r.reporterId)
        .filter((id): id is string => !!id),
    ),
  ];
  void notifyReporters(notifications, reporterIds, status);
}

export function notifyReporters(
  notifications: PostNotificationService,
  reporterIds: string[],
  status: string,
) {
  const copy =
    status === ReportStatus.RESOLVED ? PUSH.reportUpheld : PUSH.reportDismissed;
  return notifications.notifyUsers(reporterIds, copy.title, copy.body, {
    notifType: 'report_resolved',
    url: '/notifications',
  });
}
