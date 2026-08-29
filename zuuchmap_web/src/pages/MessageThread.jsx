import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { messagesApi } from '@/lib/api'
import { useAuthStore } from '@/store'

const PAGE_SIZE = 30

/** Pages are newest-first (page 0 = latest 30); flatten into one chronological list. */
const flatten = (pages = []) => [...pages].reverse().flat()
const cursorOf = (page) =>
  page.length < PAGE_SIZE ? undefined : { before: page[0].date_created, before_id: page[0].id }
/** Newest (last) page holds the live tail — optimistic rows go there. */
const patchLast = (old, fn) => {
  if (!old) return old
  const pages = [...old.pages]
  pages[0] = fn(pages[0] ?? [])
  return { ...old, pages }
}

/**
 * One conversation.
 *
 * Sends are optimistic: on a Mongolian mobile connection the round trip is long
 * enough that a message which only appears after the server answers reads as a
 * message that failed, and people send it again.
 */
export default function MessageThread() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef(null)

  const { data: thread } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => messagesApi.detail(id),
  })

  const messagesKey = ['conversation', id, 'messages']
  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: messagesKey,
    queryFn: ({ pageParam }) => messagesApi.history(id, pageParam),
    initialPageParam: undefined,
    getNextPageParam: cursorOf,
  })
  const messages = useMemo(() => flatten(data?.pages), [data])

  // Clearing the badge is the reader's own side only, and the endpoint is
  // idempotent — safe to call on every open, and again whenever a new message
  // from the other side lands while the thread is on screen; otherwise the
  // badge stays lit for a message the reader is already looking at.
  const latestTheirs = [...messages].reverse().find((m) => !m.mine && !m.pending)?.id ?? null
  useEffect(() => {
    if (!id) return
    messagesApi
      .markRead(id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['conversations'] })
        qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
      })
      .catch(() => {})
  }, [id, latestTheirs, qc])

  // Jump to the newest message, the way every chat behaves — but only when the
  // tail changes. Loading older history must not yank the reader back down.
  const lastId = messages[messages.length - 1]?.id
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  // Loading older pages prepends; keep the message the reader was looking at
  // in place by restoring the scroll offset from the bottom.
  const scrollRef = useRef(null)
  const loadOlder = async () => {
    const el = scrollRef.current
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0
    await fetchNextPage()
    // The new rows are not committed yet when the promise settles; wait a frame.
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - fromBottom })
  }

  const sendMut = useMutation({
    mutationFn: ({ body }) => messagesApi.send(id, body),
    onMutate: async ({ body, tempId }) => {
      await qc.cancelQueries({ queryKey: messagesKey })
      qc.setQueryData(messagesKey, (old) =>
        patchLast(old ?? { pages: [[]], pageParams: [undefined] }, (page) => [
          ...page.filter((m) => m.id !== tempId),
          { id: tempId, body, mine: true, pending: true, date_created: new Date().toISOString() },
        ]),
      )
    },
    onError: (_err, { tempId }) => {
      // Keep the bubble, flagged failed and tappable to retry — discarding it
      // is how a message ends up typed twice.
      qc.setQueryData(messagesKey, (old) =>
        patchLast(old, (page) => page.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))),
      )
      toast.error(t('messages.failed'))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const submit = (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    sendMut.mutate({ body, tempId: `pending-${Date.now()}` })
  }
  const retry = (m) => sendMut.mutate({ body: m.body, tempId: m.id })

  const stamp = (value) => {
    const locale = i18n.language === 'mn' ? 'mn-MN' : 'en-GB'
    return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-2xl flex flex-col h-[calc(100vh-8rem)]">
      <header className="flex items-center gap-3 pb-3 border-b border-border/40">
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label={t('common.back')}
          className="p-2 -ml-2 rounded-btn hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={18} className="text-text" />
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-text truncate">{thread?.other_party?.given_name || '—'}</p>
          {thread?.post ? (
            <Link to={`/posts/${thread.post.id}`} className="text-xs text-primary-text hover:underline truncate block">
              {thread.post.title}
            </Link>
          ) : (
            <p className="text-xs text-muted">{t('messages.deletedListing')}</p>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-2">
        {!isError && !isLoading && hasNextPage && (
          <div className="flex justify-center pb-2">
            <Button variant="secondary" size="sm" onClick={loadOlder} disabled={isFetchingNextPage}>
              {t('messages.loadOlder')}
            </Button>
          </div>
        )}
        {isError ? (
          <ErrorState onRetry={refetch} compact />
        ) : isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-card bg-surface2 animate-pulse" />)}
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                role={m.failed ? 'button' : undefined}
                tabIndex={m.failed ? 0 : undefined}
                onClick={m.failed ? () => retry(m) : undefined}
                onKeyDown={m.failed ? (e) => e.key === 'Enter' && retry(m) : undefined}
                className={`max-w-[80%] rounded-card px-3 py-2 ${
                  m.mine ? 'bg-primary text-on-primary' : 'bg-surface2 text-text'
                } ${m.pending ? 'opacity-60' : ''} ${m.failed ? 'opacity-60 ring-2 ring-danger cursor-pointer' : ''}`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${m.mine ? 'text-on-primary/70' : 'text-muted'}`}>
                  {m.failed ? t('messages.retry') : m.pending ? t('messages.sending') : stamp(m.date_created)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 pt-3 border-t border-border/40">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('messages.placeholder')}
          maxLength={2000}
          aria-label={t('messages.placeholder')}
          className="flex-1 bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-primary"
        />
        <Button type="submit" disabled={!draft.trim() || sendMut.isPending} aria-label={t('messages.send')}>
          <Send size={16} />
        </Button>
      </form>

      {!user && <p className="text-sm text-muted pt-2">{t('messages.signInRequired')}</p>}
    </div>
  )
}
