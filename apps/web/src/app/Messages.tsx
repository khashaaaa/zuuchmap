import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MESSAGE_MAX_LENGTH, type Conversation, type Message } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { displayName, useConversation, useConversations, useReplyNote, useThread } from '@/lib/deals';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useMedia, useOnline } from '@/lib/queries';
import { shortDay } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { AppHeader } from '@/ui/AppHeader';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { InboxRow } from '@/ui/InboxRow';
import { MessageBubble } from '@/ui/MessageBubble';
import { CategoryTile } from '@/ui/ListingCard';
import { SkeletonListingRow } from '@/ui/SkeletonListingRow';
import { NeedSignIn } from './NeedSignIn';

type Thread = InfiniteData<Message[], unknown>;

const draftKey = (id: string) => `zm_draft_${id}`;
const readDraft = (id: string): string => {
  try {
    return localStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
};
const writeDraft = (id: string, text: string) => {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
};

function Inbox({ activeId }: { activeId?: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const q = useConversations();
  const items = q.data ?? [];
  if (q.isPending) return <div className="flex flex-col gap-1 p-2">{Array.from({ length: 4 }, (_, i) => <SkeletonListingRow key={i} />)}</div>;
  if (q.isError) return <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('deal.chat.loadFailedTitle')} body={t('deal.chat.loadFailedBody')} action={{ label: t('deal.retry'), onClick: () => void q.refetch() }} className="py-16" />;
  if (items.length === 0) return <EmptyState icon="message-circle" title={t('customer.chat.empty')} body={t('messages.emptyHint')} action={{ label: t('deal.chat.emptyAction'), onClick: () => void nav('/browse') }} className="py-16" />;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {items.map((c) => (
        <li key={c.id}>
          <InboxRow
            name={displayName(c.other)}
            avatarSrc={c.other.company?.logo ?? c.other.profile_picture ?? undefined}
            listing={c.post_title ?? c.post?.title ?? t('messages.deletedListing')}
            preview={preview(c, t)}
            at={c.last_message_at ?? c.date_created}
            unread={c.unread}
            className={c.id === activeId ? 'bg-bg-surface-sunken!' : undefined}
            onClick={() => void nav(`/messages/${c.id}`)}
          />
        </li>
      ))}
    </ul>
  );
}

function preview(c: Conversation, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (c.last_message_kind && c.last_message_kind !== 'TEXT') return t(`deal.chat.step.${c.last_message_kind}`);
  const text = c.last_message_preview ?? '';
  return c.last_message_mine ? t('deal.chat.youPrefix', { text }) : text;
}

interface Pending { key: number; body: string; failed: boolean }
let pendingKey = 1;

function ThreadPane({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const [sp] = useSearchParams();
  const me = useAuthStore((s) => s.user?.id);
  const cats = useCategoryLookup();
  const replyNote = useReplyNote();
  const conv = useConversation(id);
  const thread = useThread(id);
  const [draft, setDraft] = useState(() => readDraft(id));
  const [pending, setPending] = useState<Pending[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const marked = useRef('');

  const newestFirst = thread.data?.pages.flat() ?? [];
  const msgs = [...newestFirst].reverse();
  const newest = newestFirst[0];
  const other = conv.data?.other;
  useDocTitle(other ? displayName(other) : t('messages.title'));

  // Mark read on open and on every new incoming message while open.
  const unread = conv.data?.unread ?? 0;
  useEffect(() => {
    if (!conv.data || !thread.data) return;
    const fresh = unread > 0 || (!!newest && newest.sender_id !== me && !newest.read_at);
    const stamp = `${id}:${newest?.id ?? ''}:${unread}`;
    if (!fresh || marked.current === stamp) return;
    marked.current = stamp;
    void api(`/conversations/${id}/read`, { method: 'PUT' })
      .then(() => {
        for (const key of ['conversations', 'conversation', 'badges']) void qc.invalidateQueries({ queryKey: [key] });
      })
      .catch(() => undefined);
  }, [id, conv.data, thread.data, newest, unread, me, qc]);

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [newest?.id, pending.length, thread.isSuccess]);

  const send = useMutation({
    mutationFn: ({ body }: { key: number; body: string }) => api<Message>(`/conversations/${id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: (m, v) => {
      qc.setQueryData<Thread>(['thread', id], (d) => (d && !d.pages.some((p) => p.some((x) => x.id === m.id)) ? { ...d, pages: [[m, ...(d.pages[0] ?? [])], ...d.pages.slice(1)] } : d));
      setPending((p) => p.filter((x) => x.key !== v.key));
      for (const key of ['conversations', 'conversation']) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e, v) => {
      setPending((p) => p.map((x) => (x.key === v.key ? { ...x, failed: true } : x)));
      toast.error(t(errorKey(e)));
    },
  });

  const submit = (text: string) => {
    const body = text.trim();
    if (!body) return;
    const key = pendingKey++;
    setPending((p) => [...p, { key, body, failed: false }]);
    send.mutate({ key, body });
  };
  const retry = (p: Pending) => {
    setPending((all) => all.map((x) => (x.key === p.key ? { ...x, failed: false } : x)));
    send.mutate({ key: p.key, body: p.body });
  };
  const sendDraft = () => {
    submit(draft);
    setDraft('');
    writeDraft(id, '');
  };

  if (conv.isError || thread.isError) {
    return <EmptyState icon={online ? 'refresh-cw' : 'wifi-off'} title={t('deal.chat.loadFailedTitle')} body={t('deal.chat.loadFailedBody')} action={{ label: t('deal.retry'), onClick: () => { void conv.refetch(); void thread.refetch(); } }} className="py-24" />;
  }

  const c = conv.data;
  const post = c?.post;
  const parts = post ? f.priceParts(post.price_amount, post.price_unit) : null;
  const rentable = !!post && !!cats.byKey.get(post.category)?.rentable;
  const dFrom = sp.get('date_from');
  const dTo = sp.get('date_to');
  const quick = [
    dFrom && dTo ? t('deal.chat.qDates', { dates: `${shortDay(dFrom)} – ${shortDay(dTo)}` }) : t('deal.chat.qAvailable'),
    ...(rentable ? [t('deal.chat.qOperator'), t('deal.chat.qDelivery')] : []),
  ];
  const note = replyNote(other?.reply_minutes);
  const name = other ? displayName(other) : '';
  const today = f.date(new Date());
  const yesterday = f.date(new Date(Date.now() - 86_400_000));
  const dayLabel = (d: string) => (d === today ? t('deal.chat.today') : d === yesterday ? t('deal.chat.yesterday') : d);
  const lastOwn = [...msgs].reverse().find((m) => m.sender_id === me && m.kind === 'TEXT');
  const empty = thread.isSuccess && msgs.length === 0 && pending.length === 0;

  return (
    <div className="flex h-dvh min-h-0 flex-col md:h-full">
      <AppHeader variant="chat" name={name} replyNote={note} avatarSrc={other?.company?.logo ?? other?.profile_picture ?? undefined} onBack={() => void nav('/messages')} className="md:hidden" />
      <div className="hidden items-center gap-3 border-b border-border-subtle px-5 py-3 md:flex">
        <Avatar name={name} src={other?.company?.logo ?? other?.profile_picture ?? undefined} size="medium" />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-body-bold text-text-primary">{name}</h1>
          {note && <p className="truncate text-small text-text-secondary">{note}</p>}
        </div>
      </div>

      {c && (
        <div className="px-4 pb-2 pt-1 md:px-5 md:pt-3">
          {post ? (
            <Link to={`/posts/${post.id}`} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface p-2.5 focus-visible:outline-none focus-visible:shadow-focus">
              <span className="size-12 shrink-0 overflow-hidden rounded-md">
                {post.images?.[0] ? <img src={post.images[0]} alt="" className="size-full object-cover" /> : <CategoryTile categoryKey={post.category} icon={cats.byKey.get(post.category)?.icon} glyph={22} className="size-full" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-small text-text-secondary">{t('messages.aboutListing')}</span>
                <span className="line-clamp-2 text-label-strong text-text-primary">{post.title}</span>
                {parts && <span className="text-caption text-text-secondary">{parts.amount}{parts.unit ? ` / ${parts.unit}` : ''}</span>}
              </span>
              <Icon name="chevron-right" size={20} className="text-icon-secondary" />
            </Link>
          ) : (
            <p className="rounded-xl border border-border-subtle bg-bg-surface p-3 text-caption text-text-secondary">{c.post_title ?? t('messages.deletedListing')}</p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 md:px-5">
        {thread.isPending && <p role="status" className="py-8 text-center text-caption text-text-secondary">{t('ui.loading')}</p>}
        {thread.hasNextPage && (
          <Button size="medium" variant="outline" className="self-center" loading={thread.isFetchingNextPage} onClick={() => void thread.fetchNextPage()}>{t('messages.loadOlder')}</Button>
        )}
        {empty && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-pill bg-bg-surface-sunken text-icon-secondary"><Icon name="message-circle" size={28} /></span>
            <h2 className="text-title text-text-primary">{t('deal.chat.firstTitle')}</h2>
            <p className="max-w-[320px] text-caption text-text-secondary">{t('deal.chat.firstBody')}</p>
            <p className="text-label-strong text-text-primary">{t('deal.chat.quick')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quick.map((q) => <Chip key={q} label={q} onClick={() => submit(q)} />)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          const day = f.date(m.date_created);
          const sep = i === 0 || f.date(msgs[i - 1]?.date_created) !== day;
          return (
            <Fragment key={m.id}>
              {sep && <p className="py-1 text-center text-small text-text-secondary">{dayLabel(day)}</p>}
              {m.kind !== 'TEXT' ? (
                <p className="self-center rounded-pill bg-bg-surface-sunken px-3 py-1 text-center text-small text-text-secondary">{t(`deal.chat.step.${m.kind}`)}</p>
              ) : (
                <MessageBubble direction={m.sender_id === me ? 'out' : 'in'} text={m.body} at={m.date_created} status={m.read_at ? 'read' : 'sent'} />
              )}
              {m === lastOwn && m.read_at && <p className="-mt-1 self-end text-small text-text-secondary">{t('deal.chat.read')}</p>}
            </Fragment>
          );
        })}
        {pending.map((p) => (
          <div key={p.key} className="flex flex-col items-end gap-1 self-end">
            <MessageBubble direction="out" text={p.body} at={new Date()} status="sending" className={cn(p.failed && 'opacity-60')} />
            {p.failed && <button type="button" onClick={() => retry(p)} className="text-small text-status-danger">{t('messages.retry')}</button>}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendDraft();
        }}
        className="flex items-end gap-2 border-t border-border-subtle bg-bg-surface px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 md:px-5"
      >
        <textarea
          aria-label={t('messages.placeholder')}
          rows={1}
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={t('messages.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            writeDraft(id, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendDraft();
            }
          }}
          className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-input border border-border-default bg-bg-surface px-4 py-3 text-body text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-focus"
        />
        <IconButton type="submit" icon="send" label={t('messages.send')} variant="primary" disabled={!draft.trim()} />
      </form>
    </div>
  );
}

/** I1 / I2 and the M states. Phone: inbox, then the thread alone. md and up: both side by side (I1d). */
export default function Messages() {
  const { t } = useTranslation();
  const id = useParams().id;
  const token = useAuthStore((s) => s.token);
  const nav = useNavigate();
  const wide = useMedia('(min-width: 768px)');
  const newest = useConversations().data?.[0]?.id;
  useDocTitle(t('messages.title'));
  // Side by side (I1d) never shows an empty thread pane next to a full inbox: open the newest.
  useEffect(() => {
    if (wide && !id && newest) void nav(`/messages/${newest}`, { replace: true });
  }, [wide, id, newest, nav]);
  if (!token) return <NeedSignIn />;
  return (
    <div className="mx-auto flex w-full max-w-[1280px] md:h-[calc(100dvh-76px)] lg:px-20">
      <section className={cn('min-w-0 flex-1 md:max-w-[380px] md:flex-none md:overflow-y-auto md:border-r md:border-border-subtle', id && 'hidden md:block')}>
        <AppHeader variant="root" title={t('messages.title')} className="md:hidden" />
        <h1 className="hidden px-5 pb-2 pt-6 text-h2 text-text-primary md:block">{t('messages.title')}</h1>
        <Inbox activeId={id} />
      </section>
      <section className={cn('min-w-0 flex-1', !id && 'hidden md:flex md:items-center md:justify-center')}>
        {id ? <ThreadPane key={id} id={id} /> : <EmptyState icon="message-circle" title={t('customer.chat.empty')} body={t('messages.emptyHint')} />}
      </section>
    </div>
  );
}
