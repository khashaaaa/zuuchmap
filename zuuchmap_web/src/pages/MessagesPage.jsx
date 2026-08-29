import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { messagesApi } from '@/lib/api'
import { goBack } from '@/lib/utils'

/**
 * The inbox.
 *
 * Every negotiation used to leave the platform the moment a phone number was
 * revealed, which meant no record when two people disagreed and no way to see
 * whether a listing converts. One thread per (listing, customer): the same
 * customer asking about an excavator and about a truck is asking two different
 * questions, and one merged thread loses which listing is being discussed.
 */
export default function MessagesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  // Cursor on the last thread's activity timestamp; 50 per page.
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => messagesApi.list(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (page) =>
      page.length < 50
        ? undefined
        : { before: page[page.length - 1].last_message_at || page[page.length - 1].date_created, before_id: page[page.length - 1].id },
  })
  const threads = useMemo(() => (data?.pages ?? []).flat(), [data])

  const stamp = (value) => {
    if (!value) return ''
    const d = new Date(value)
    const locale = i18n.language === 'mn' ? 'mn-MN' : 'en-GB'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Time for today, date for anything older — an inbox full of "14:32" tells
    // you nothing about which conversations have gone cold.
    return d >= today
      ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('messages.title')}
        icon={MessageSquare}
        onBack={() => goBack(navigate, '/')}
      />

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-card bg-surface2 animate-pulse" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t('messages.empty')}
          description={t('messages.emptyHint')}
        />
      ) : (
        <ul className="space-y-2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => navigate(`/messages/${thread.id}`)}
                className="w-full text-left flex gap-3 items-center p-3 rounded-card bg-surface hover:bg-surface2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <div className="w-12 h-12 rounded-btn bg-surface2 overflow-hidden shrink-0">
                  {thread.post?.images?.[0] ? (
                    <img
                      src={thread.post.images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MessageSquare size={18} className="text-muted" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-text truncate">
                      {thread.other_party?.given_name || '—'}
                    </span>
                    <span className="text-xs text-muted shrink-0">{stamp(thread.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-muted truncate">
                    {thread.post?.title || t('messages.deletedListing')}
                  </p>
                  <p className="text-sm text-text/80 truncate mt-0.5">
                    {thread.last_message_preview || ''}
                  </p>
                </div>

                {thread.unread > 0 && (
                  <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center">
                    {thread.unread > 99 ? '99+' : thread.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
          {hasNextPage && (
            <li className="flex justify-center pt-2">
              <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {t('messages.loadMore')}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
