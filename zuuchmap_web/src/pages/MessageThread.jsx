import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import ErrorState from '@/components/ErrorState'
import Button from '@/components/Button'
import { messagesApi } from '@/lib/api'
import { useAuthStore } from '@/store'

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

  const { data: messages = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['conversation', id, 'messages'],
    queryFn: () => messagesApi.history(id),
  })

  // Clearing the badge is the reader's own side only, and the endpoint is
  // idempotent — safe to call on every open.
  useEffect(() => {
    if (!id) return
    messagesApi
      .markRead(id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['conversations'] })
        qc.invalidateQueries({ queryKey: ['messages', 'unread'] })
      })
      .catch(() => {})
  }, [id, qc])

  // Jump to the newest message, the way every chat behaves. `auto` rather than
  // `smooth` on first paint: animating a scroll the user did not ask for is
  // motion for its own sake.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const sendMut = useMutation({
    mutationFn: (body) => messagesApi.send(id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['conversation', id, 'messages'] })
      const previous = qc.getQueryData(['conversation', id, 'messages'])
      qc.setQueryData(['conversation', id, 'messages'], (old = []) => [
        ...old,
        { id: `pending-${Date.now()}`, body, mine: true, pending: true, date_created: new Date().toISOString() },
      ])
      return { previous }
    },
    onError: (_err, _body, context) => {
      // Put the text back in the box rather than leaving a message that looks
      // sent but never was.
      qc.setQueryData(['conversation', id, 'messages'], context?.previous)
      toast.error(t('messages.failed'))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', id, 'messages'] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  const submit = (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    sendMut.mutate(body)
  }

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

      <div className="flex-1 overflow-y-auto py-4 space-y-2">
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
                className={`max-w-[80%] rounded-card px-3 py-2 ${
                  m.mine ? 'bg-primary text-on-primary' : 'bg-surface2 text-text'
                } ${m.pending ? 'opacity-60' : ''}`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${m.mine ? 'text-on-primary/70' : 'text-muted'}`}>
                  {m.pending ? t('messages.sending') : stamp(m.date_created)}
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
