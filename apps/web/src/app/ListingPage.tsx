import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, countDays, formatDate, priceForDays, type Listing } from '@zuuchmap/core';
import { api, ApiError } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { displayName, useOpenChat, useReplyNote } from '@/lib/deals';
import { useCategoryLookup, useOptionLabel, usePlace } from '@/lib/labels';
import { recordCall } from '@/lib/provider';
import { useDocTitle } from '@/lib/meta';
import { useListing, useOnline, useSimilar } from '@/lib/queries';
import { useSaves } from '@/lib/saved';
import { shortDay } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useFormat } from '@/lib/useFormat';
import { ACTION_BAR_PADDING } from '@/lib/actionBar';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { CategoryTile } from '@/ui/ListingCard';
import { ListingActionBar } from '@/ui/ListingActionBar';
import { SellerCard } from '@/ui/SellerCard';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { ListingRow } from './ListingRow';
import { AvailabilitySheet } from './sheets/AvailabilitySheet';
import { BookingSheet } from './sheets/BookingSheet';
import { ShareSheet } from './sheets/ShareSheet';

/** Consecutive `YYYY-MM-DD` days folded into ranges. */
function ranges(days: readonly string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const d of [...days].sort()) {
    const last = out[out.length - 1];
    if (last && Date.parse(d) - Date.parse(last.to) === 86_400_000) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

function Unavailable() {
  const { t } = useTranslation();
  const nav = useNavigate();
  useDocTitle(t('customer.detail.unavailableTitle'));
  return (
    <EmptyState
      icon="circle-alert"
      title={t('customer.detail.unavailableTitle')}
      body={t('customer.detail.unavailableBody')}
      action={{ label: t('customer.detail.backToSearch'), onClick: () => void nav('/browse') }}
      className="py-24"
    />
  );
}

/** The seller card as a link to the seller page. */
function SellerLink({ to, className, children }: { to: string | null; className?: string; children: ReactNode }) {
  return to ? <Link to={to} className={cn('block rounded-xl focus-visible:outline-none focus-visible:shadow-focus', className)}>{children}</Link> : <div className={className}>{children}</div>;
}

function Detail({ listing }: { listing: Listing }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const cats = useCategoryLookup();
  const place = usePlace();
  const optionLabel = useOptionLabel();
  const saves = useSaves();
  const similar = useSimilar(listing.id);
  const openChat = useOpenChat();
  const replyNote = useReplyNote();
  const [sheet, setSheet] = useState<'share' | 'book' | 'calendar' | null>(() => (sp.get('book') ? 'book' : null));
  const cat = cats.byKey.get(listing.category);
  const sub = cat?.subcategories.find((s) => s.value === listing.subcategory)?.label;
  useDocTitle(listing.title);

  // One view per opening; the engine dedupes per visitor.
  useEffect(() => {
    track(ANALYTICS_EVENTS.LISTING_OPENED, { id: listing.id });
    void api(`/posts/${listing.id}/views`, { method: 'PUT' }).catch(() => undefined);
  }, [listing.id]);

  const images = listing.images ?? [];
  const parts = f.priceParts(listing.price_amount, listing.price_unit);
  const attrs = listing.attributes ?? {};
  const operator = cat?.fields.find((x) => x.key === 'with_operator');
  const withOperator = operator && attrs.with_operator === true ? operator.label.toLowerCase() : null;
  const kind = cat?.primary_action === 'BOOK' ? 'book' : cat?.primary_action === 'CALL_NOW' ? 'sos' : 'call';
  const url = `${window.location.origin}/posts/${listing.id}`;
  const loc = place(listing.province, listing.district);
  const seller = listing.user;
  const sellerName = displayName(seller);
  const sellerRating = typeof seller?.rating_average === 'number' ? { value: seller.rating_average, count: seller.rating_count ?? 0 } : undefined;
  const sellerNote = replyNote(seller?.reply_minutes);
  const sellerTo = seller ? `/sellers/${seller.id}` : null;
  const memberSince = seller?.date_created ? t('customer.detail.memberSince', { date: formatDate(seller.date_created, f.locale).slice(0, 7) }) : undefined;
  const area = seller?.company?.service_area ?? [];
  const sellerArea = area.length > 0 ? t('deal.seller.area', { areas: area.map((c) => t(`province.${c}`)).join(', ') }) : null;
  const saved = saves.isSaved(listing.id);
  const dFrom = sp.get('date_from');
  const dTo = sp.get('date_to');

  const call = () => {
    if (!listing.contact_phone) {
      toast.error(t('posts.noPhone'));
      return;
    }
    track(ANALYTICS_EVENTS.CONTACT_CALL, { id: listing.id });
    recordCall(listing.id);
    window.location.href = `tel:${listing.contact_phone}`;
  };
  const message = () =>
    requireAuth('message', () => {
      track(ANALYTICS_EVENTS.CONTACT_MESSAGE, { id: listing.id });
      openChat.mutate({ postId: listing.id, search: dFrom && dTo ? `?date_from=${dFrom}&date_to=${dTo}` : undefined });
    });
  const pending = !!listing.my_pending_booking_id;
  const primary = () => (kind === 'book' ? (pending ? void nav('/bookings') : requireAuth('book', () => setSheet('book'))) : call());

  // Availability line (rentable only): the searched dates when free, else the first booked stretch in the next 14 days.
  const busy = ranges(listing.busy_dates ?? []);
  const asked = dFrom && dTo ? countDays(dFrom, dTo) : 0;
  const clash = !!(dFrom && dTo && (listing.busy_dates ?? []).some((d) => d >= dFrom && d <= dTo));
  const sum = asked ? priceForDays(listing.price_amount, listing.price_unit, asked) : null;
  let availability: { title: string; sub?: string; ok: boolean } | null = null;
  if (cat?.rentable) {
    if (asked && !clash) availability = { ok: true, title: t('customer.detail.freeOn', { from: shortDay(dFrom ?? ''), to: shortDay(dTo ?? '') }), sub: sum !== null ? t('customer.browse.daysTotal', { days: asked, total: f.amount(sum) ?? '' }) : undefined };
    else if (busy[0]) availability = { ok: false, title: t('customer.detail.bookedOn', { from: shortDay(busy[0].from), to: shortDay(busy[0].to) }) };
    else availability = { ok: true, title: t('kit.status.available') };
  }

  const specs = (cat?.fields ?? []).flatMap((fld) => {
    const v = attrs[fld.key];
    if (v === undefined || v === null || v === '') return [];
    const text = typeof v === 'boolean' ? (v ? t('customer.detail.yes') : t('customer.detail.no')) : fld.type === 'select' ? optionLabel(String(v)) : `${String(v)}${fld.unit ? ` ${fld.unit}` : ''}`;
    return [{ key: fld.key, label: fld.label, text }];
  });
  const directions = listing.latitude !== null && listing.longitude !== null
    ? `https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([listing.address, loc].filter(Boolean).join(' '))}`;

  const iconBtn = 'bg-bg-media-scrim!';
  const actions = (
    <>
      <IconButton icon="share-2" label={t('customer.share.title')} variant="media" size="medium" className={iconBtn} onClick={() => setSheet('share')} />
      <IconButton icon="bookmark" label={t('common.save')} variant="media" size="medium" aria-pressed={saved} className={cn(iconBtn, saved && '[&_svg]:fill-current')} onClick={() => saves.toggle(listing)} />
    </>
  );

  return (
    <div className={cn('mx-auto w-full max-w-[1280px] lg:px-20 lg:pt-6', ACTION_BAR_PADDING)}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0">
          <div className="relative">
            <button
              type="button"
              disabled={images.length === 0}
              onClick={() => void nav(`/posts/${listing.id}/photos`)}
              aria-label={t('customer.detail.counter', { index: 1, total: Math.max(images.length, 1) })}
              className="block aspect-[4/3] w-full overflow-hidden bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus md:aspect-[16/9] lg:rounded-xl"
            >
              {images[0] ? <img src={images[0]} alt="" className="size-full object-cover" /> : <CategoryTile categoryKey={listing.category} icon={cat?.icon} glyph={96} className="size-full" />}
            </button>
            <IconButton icon="arrow-left" label={t('common.back')} variant="media" size="medium" className={cn(iconBtn, 'absolute! left-3 top-3 lg:hidden')} onClick={() => void nav(-1)} />
            <div className="absolute right-3 top-3 flex gap-2 lg:hidden">{actions}</div>
            {images.length > 0 && <span className="absolute bottom-3 right-3 rounded-pill bg-bg-media-scrim px-2.5 py-1 text-label-strong text-text-on-media">{t('customer.detail.counter', { index: 1, total: images.length })}</span>}
          </div>

          <div className="flex flex-col gap-3 px-4 pt-4 md:px-6 lg:px-0">
            <p className="text-overline" style={{ color: `var(--color-category-text-${listing.category})` }}>{[cat?.label, sub].filter(Boolean).join(' · ')}</p>
            <h1 className="text-h1 text-text-primary">{listing.title}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-secondary">
              {loc && <span className="inline-flex items-center gap-1"><Icon name="map-pin" size={14} />{loc}</span>}
              <span className="inline-flex items-center gap-1"><Icon name="eye" size={14} />{t('ui.views', { count: listing.views })}</span>
            </p>
            {parts && (
              <p className="flex flex-wrap items-baseline gap-x-1.5 lg:hidden">
                <span className="text-h2 text-text-primary">{parts.amount}</span>
                {(parts.unit || withOperator) && <span className="text-body text-text-secondary">/ {[parts.unit, withOperator].filter(Boolean).join(', ')}</span>}
              </p>
            )}
            {availability && (
              <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3 lg:hidden', availability.ok ? 'bg-status-success-tint' : 'bg-status-info-tint')}>
                <Icon name="calendar" size={20} className={availability.ok ? 'text-status-success' : 'text-status-info'} />
                <div className="min-w-0 flex-1">
                  <p className="text-label-strong text-text-primary">{availability.title}</p>
                  {availability.sub && <p className="text-caption text-text-secondary">{availability.sub}</p>}
                </div>
                <button type="button" onClick={() => setSheet('calendar')} className="inline-flex h-12 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('customer.detail.calendar')}</button>
              </div>
            )}

            <SellerLink to={sellerTo} className="lg:hidden">
              <SellerCard
                name={sellerName}
                avatarSrc={seller?.company?.logo ?? seller?.profile_picture ?? undefined}
                verified={!!seller?.company?.is_verified}
                verifiedLabel={t('kit.status.verified')}
                meta={[memberSince, seller?.company ? seller.given_name : null, sellerArea].filter(Boolean).join(' · ')}
                rating={sellerRating}
                replyNote={sellerNote}
              />
            </SellerLink>

            {specs.length > 0 && (
              <section className="flex flex-col gap-3 pt-2">
                <h2 className="text-h3 text-text-primary">{t('customer.detail.specs')}</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-border-subtle bg-bg-surface p-4 md:grid-cols-3">
                  {specs.map((s) => (
                    <div key={s.key} className="flex min-w-0 flex-col gap-0.5">
                      <dt className="text-small text-text-secondary">{s.label}</dt>
                      <dd className="text-body-bold text-text-primary">{s.text}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {listing.details && (
              <section className="flex flex-col gap-2 pt-2">
                <h2 className="text-h3 text-text-primary">{t('common.description')}</h2>
                <p className="whitespace-pre-line text-body text-text-primary">{listing.details}</p>
              </section>
            )}

            <section className="flex flex-col gap-2 pt-2">
              <h2 className="text-h3 text-text-primary">{t('posts.sectionLocation')}</h2>
              <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-bg-surface-sunken text-icon-secondary"><Icon name="map-pin" size={22} /></span>
                <p className="min-w-0 flex-1 text-body text-text-primary">{[listing.address, loc].filter(Boolean).join(' · ') || t('common.locationUnknown')}</p>
                <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 shrink-0 items-center gap-1 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
                  {t('customer.detail.directions')}<Icon name="external-link" size={14} />
                </a>
              </div>
            </section>

            {(similar.data?.length ?? 0) > 0 && (
              <section className="flex flex-col gap-3 pt-4">
                <h2 className="text-h3 text-text-primary">{t('posts.similarTitle')}</h2>
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 zm-noscroll">
                  {similar.data?.map((it) => <div key={it.id} className="w-[260px] shrink-0 snap-start"><ListingRow item={it} variant="grid" /></div>)}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* desktop: sticky price + actions */}
        <aside className="hidden flex-col gap-4 self-start lg:sticky lg:top-6 lg:flex">
          <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-5">
            {parts && (
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-h2 text-text-primary">{parts.amount}</span>
                {(parts.unit || withOperator) && <span className="text-body text-text-secondary">/ {[parts.unit, withOperator].filter(Boolean).join(', ')}</span>}
              </p>
            )}
            {availability && (
              <button type="button" onClick={() => setSheet('calendar')} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 text-left', availability.ok ? 'bg-status-success-tint' : 'bg-status-info-tint')}>
                <Icon name="calendar" size={20} className={availability.ok ? 'text-status-success' : 'text-status-info'} />
                <span className="flex-1"><span className="block text-label-strong text-text-primary">{availability.title}</span>{availability.sub && <span className="block text-caption text-text-secondary">{availability.sub}</span>}</span>
              </button>
            )}
            <Button variant={kind === 'sos' ? 'danger' : kind === 'book' && pending ? 'outline' : 'primary'} icon={kind === 'book' ? undefined : 'phone'} onClick={primary}>{kind === 'book' ? (pending ? t('deal.sent.pendingCta') : t('kit.action.book')) : kind === 'sos' ? t('kit.action.sos') : t('kit.action.call')}</Button>
            {kind !== 'sos' && <Button variant="outline" icon="message-circle" onClick={message}>{t('messages.title')}</Button>}
            {kind === 'book' && <p className="text-small text-text-secondary">{t('posts.phoneAfterBooking')}</p>}
          </div>
          <SellerLink to={sellerTo}>
            <SellerCard name={sellerName} avatarSrc={seller?.company?.logo ?? seller?.profile_picture ?? undefined} verified={!!seller?.company?.is_verified} verifiedLabel={t('kit.status.verified')} meta={[memberSince, seller?.company ? seller.given_name : null, sellerArea].filter(Boolean).join(' · ')} rating={sellerRating} replyNote={sellerNote} />
          </SellerLink>
          <div className="flex gap-2">
            <Button variant="outline" size="medium" icon="share-2" onClick={() => setSheet('share')}>{t('customer.share.title')}</Button>
            <Button variant="outline" size="medium" icon="bookmark" className={cn(saved && "[&_svg]:fill-current")} onClick={() => saves.toggle(listing)}>{t('common.save')}</Button>
          </div>
        </aside>
      </div>

      <ListingActionBar
        kind={kind}
        price={listing.price_amount}
        priceUnit={listing.price_unit}
        onPrimary={primary}
        onMessage={message}
        pending={pending}
        note={kind === 'book' ? t('posts.phoneAfterBooking') : undefined}
        className="lg:hidden"
      />
      <ShareSheet open={sheet === 'share'} onClose={() => setSheet(null)} url={url} title={listing.title ?? ''} />
      <BookingSheet open={sheet === 'book'} onClose={() => setSheet(null)} listing={listing} initial={dFrom && dTo && !clash ? { start: dFrom, end: dTo } : undefined} />
      <AvailabilitySheet open={sheet === 'calendar'} onClose={() => setSheet(null)} listing={listing} />
    </div>
  );
}

/** B2 / B6 and C7. */
export default function ListingPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const online = useOnline();
  const q = useListing(id);
  if (q.isPending) return <div className="mx-auto flex max-w-[720px] flex-col gap-3 p-4"><SkeletonListingRow /><SkeletonListingRow /></div>;
  if (q.isError) {
    const e = q.error;
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return <Unavailable />;
    return <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('customer.browse.loadFailed')} body={online ? t('customer.browse.loadFailedBody') : t('offline.noConnection')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} className="py-24" />;
  }
  return <Detail listing={q.data} />;
}

/** B5: the photos full screen. */
export function Gallery() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const id = Number(useParams().id);
  const q = useListing(id);
  const [index, setIndex] = useState(0);
  useDocTitle(q.data?.title);
  const images = q.data?.images ?? [];
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg-inverse text-text-on-media">
      <div className="flex h-14 items-center gap-2 px-2">
        <IconButton icon="x" label={t('common.close')} variant="media" size="medium" onClick={() => void nav(`/posts/${id}`)} />
        <span className="flex-1 text-center text-label-strong">{images.length > 0 ? t('customer.detail.counter', { index: index + 1, total: images.length }) : ''}</span>
        <span className="size-10" />
      </div>
      {images.length === 0 ? (
        <div className="flex flex-1 items-center justify-center"><p className="flex items-center gap-2 text-body"><Icon name="image" size={22} />{t('posts.noImage')}</p></div>
      ) : (
        <div
          className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {images.map((src) => <div key={src} className="flex w-full shrink-0 snap-center items-center justify-center"><img src={src} alt="" className="max-h-full max-w-full object-contain" /></div>)}
        </div>
      )}
      <p className="px-4 pb-6 pt-2 text-center text-caption opacity-80">{t('customer.detail.galleryHint')}</p>
      <Link to={`/posts/${id}`} className="sr-only">{t('common.back')}</Link>
    </div>
  );
}
