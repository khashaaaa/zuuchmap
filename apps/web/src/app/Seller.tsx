import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type Review, type ReviewSort } from '@zuuchmap/core';
import { ApiError } from '@/lib/api';
import { requireAuth, useAuthStore } from '@/lib/auth';
import { displayName, useOpenChat, useProviderReviews, useReplyNote, useSeller } from '@/lib/deals';
import { useDocTitle } from '@/lib/meta';
import { useOnline } from '@/lib/queries';
import { useFormat } from '@/lib/useFormat';
import { AppHeader } from '@/ui/AppHeader';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { ReportSheet } from './sheets/ReportSheet';
import { ReviewItem } from '@/ui/ReviewItem';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { ListingRow } from './ListingRow';
import { ReplySheet } from './sheets/ReplySheet';
import { ReviewSheet } from './sheets/ReviewSheet';

type Sheet = { kind: 'write' } | { kind: 'reply'; review: Review } | null;

/** The write / edit / reply sheets of a seller's reviews. */
function ReviewSheets({ sheet, onClose, sellerId, sellerName, own }: { sheet: Sheet; onClose: () => void; sellerId: string; sellerName: string; own: Review | null }) {
  return (
    <>
      <ReviewSheet open={sheet?.kind === 'write'} onClose={onClose} providerId={sellerId} existing={own} />
      {sheet?.kind === 'reply' && <ReplySheet open onClose={onClose} review={sheet.review} providerName={sellerName} />}
    </>
  );
}

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState icon="circle-alert" title={t('errors.notFound')} action={{ label: t('customer.detail.backToSearch'), onClick: () => void nav('/browse') }} className="py-24" />;
  }
  return <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} action={{ label: t('common.retry'), onClick: retry }} className="py-24" />;
}

/** V1: the seller page. */
export default function Seller() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const id = useParams().id ?? '';
  const me = useAuthStore((s) => s.user?.id);
  const replyNote = useReplyNote();
  const q = useSeller(id);
  const reviews = useProviderReviews(id);
  const open = useOpenChat();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [report, setReport] = useState<Review | null>(null);
  const seller = q.data?.user;
  const name = displayName(seller);
  useDocTitle(name);

  if (q.isPending) return <div className="mx-auto flex max-w-[720px] flex-col gap-3 p-4"><SkeletonListingRow /><SkeletonListingRow /></div>;
  if (q.isError) return <Failed error={q.error} retry={() => void q.refetch()} />;

  const { user, jobs, listings, reviews: newest } = q.data;
  const first = reviews.data?.pages[0];
  const own = first?.own ?? null;
  const canReview = !!first?.can_review;
  const count = user.rating_count ?? first?.count ?? 0;
  const mine = me === user.id;
  const note = replyNote(user.reply_minutes);
  const since = f.date(user.date_created).slice(0, 7);
  const firstListing = listings[0];
  const chat = () => firstListing && requireAuth('message', () => open.mutate({ postId: firstListing.id }));

  return (
    <div className="mx-auto w-full max-w-[880px] pb-12">
      <AppHeader variant="pushed" title={name} onBack={() => void nav(-1)} className="md:hidden" />
      <div className="flex flex-col gap-6 px-4 pt-3 md:px-6 md:pt-8">
        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} src={user.company?.logo ?? user.profile_picture ?? undefined} type="company" size="large" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="flex items-center gap-1 text-h3 text-text-primary">
                <span className="truncate">{name}</span>
                {user.company?.is_verified && <span role="img" aria-label={t('kit.status.verified')} className="inline-flex text-icon-accent"><Icon name="badge-check" size={20} /></span>}
              </h1>
              <p className="text-caption text-text-secondary">{t('deal.seller.memberJobs', { date: since, count: jobs })}</p>
              {(user.company?.service_area?.length ?? 0) > 0 && <p className="text-caption text-text-secondary">{t('deal.seller.area', { areas: user.company?.service_area.map((c) => t(`province.${c}`)).join(', ') })}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {typeof user.rating_average === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={16} className="fill-status-warning text-status-warning" />
                <span className="text-label-strong text-text-primary">{user.rating_average.toFixed(1)}</span>
                <span className="text-caption text-text-secondary">({count})</span>
              </span>
            )}
            {note && <span className="inline-flex items-center gap-1 text-caption text-text-secondary"><Icon name="clock" size={16} />{note}</span>}
          </div>
          {!mine && firstListing && <Button icon="message-circle" loading={open.isPending} onClick={chat}>{t('messages.messageProvider')}</Button>}
        </section>

        {listings.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-h3 text-text-primary">{t('customer.saved.listings', { count: listings.length })}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {listings.map((it) => <ListingRow key={it.id} item={it} hideSave={mine} />)}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 text-h3 text-text-primary">{t('review.title')}{count > 0 ? ` · ${count}` : ''}</h2>
            {!mine && (canReview || own) && (
              <Button size="medium" variant="outline" icon="star" onClick={() => requireAuth('generic', () => setSheet({ kind: 'write' }))}>{own ? t('review.editRating') : t('review.submit')}</Button>
            )}
          </div>
          {newest.length === 0 ? (
            <p className="py-4 text-caption text-text-secondary">{t('review.empty')}</p>
          ) : (
            <div>
              {newest.map((r) => <ReviewItem key={r.id} review={r} providerName={name} onReply={mine ? () => setSheet({ kind: 'reply', review: r }) : undefined} onEdit={r.author.id === me ? () => setSheet({ kind: 'write' }) : undefined} onReport={r.author.id !== me ? () => requireAuth('generic', () => setReport(r)) : undefined} />)}
            </div>
          )}
          {count > newest.length && (
            <Link to={`/sellers/${id}/reviews`} className="inline-flex h-12 items-center gap-1 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
              {t('review.showAll', { count })}<Icon name="chevron-right" size={16} />
            </Link>
          )}
        </section>
        <p className="text-small text-text-secondary">{t('deal.review.rules')}</p>
      </div>
      <ReportSheet target={report ? { kind: 'REVIEW', review: report, providerName: name } : null} onClose={() => setReport(null)} />
      <ReviewSheets sheet={sheet} onClose={() => setSheet(null)} sellerId={id} sellerName={name} own={own} />
    </div>
  );
}

const STARS = ['5', '4', '3', '2', '1'] as const;

/** V2: every review, with the average, the per-star bars and a sort. */
export function SellerReviews() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const id = useParams().id ?? '';
  const me = useAuthStore((s) => s.user?.id);
  const seller = useSeller(id);
  const [sort, setSort] = useState<ReviewSort>('new');
  const q = useProviderReviews(id, sort);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [report, setReport] = useState<Review | null>(null);
  const name = displayName(seller.data?.user);
  useDocTitle(t('deal.review.allTitle', { name }));

  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const mine = me === id;
  const total = first?.count ?? 0;
  const sorts: { key: ReviewSort; label: string }[] = [
    { key: 'new', label: t('deal.review.sortNew') },
    { key: 'high', label: t('deal.review.sortHigh') },
    { key: 'low', label: t('deal.review.sortLow') },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <AppHeader variant="pushed" title={t('deal.review.allTitle', { name })} onBack={() => void nav(-1)} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{t('deal.review.allTitle', { name })}</h1>
      {q.isError ? (
        <Failed error={q.error} retry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4 px-4 pt-3 md:px-6">
          {first && (
            <div className="flex items-center gap-6 rounded-xl border border-border-subtle bg-bg-surface p-5">
              <div className="flex flex-col items-center gap-1">
                <span className="text-display text-text-primary">{first.average !== null ? first.average.toFixed(1) : '–'}</span>
                <span className="text-caption text-text-secondary">{t('review.count', { count: total })}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {STARS.map((s) => (
                  <div key={s} className="flex items-center gap-2 text-small text-text-secondary">
                    <span className="w-3 text-right">{s}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-pill bg-bg-surface-sunken">
                      <span className="block h-full rounded-pill bg-status-warning" style={{ width: total ? `${(first.stats[s] / total) * 100}%` : 0 }} />
                    </span>
                    <span className="w-6 text-right">{first.stats[s]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {sorts.map((s) => <Chip key={s.key} label={s.label} selected={sort === s.key} onClick={() => setSort(s.key)} />)}
          </div>
          {q.isPending ? (
            <SkeletonListingRow />
          ) : items.length === 0 ? (
            <p className="py-4 text-caption text-text-secondary">{t('review.empty')}</p>
          ) : (
            <div>
              {items.map((r) => <ReviewItem key={r.id} review={r} providerName={name} onReply={mine ? () => setSheet({ kind: 'reply', review: r }) : undefined} onEdit={r.author.id === me ? () => setSheet({ kind: 'write' }) : undefined} onReport={r.author.id !== me ? () => requireAuth('generic', () => setReport(r)) : undefined} />)}
            </div>
          )}
          {q.hasNextPage && <Button variant="outline" size="medium" className="self-center" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{t('customer.landing.seeAll')}</Button>}
          <p className="text-small text-text-secondary">{t('deal.review.rules')}</p>
        </div>
      )}
      <ReportSheet target={report ? { kind: 'REVIEW', review: report, providerName: name } : null} onClose={() => setReport(null)} />
      <ReviewSheets sheet={sheet} onClose={() => setSheet(null)} sellerId={id} sellerName={name} own={first?.own ?? null} />
    </div>
  );
}
