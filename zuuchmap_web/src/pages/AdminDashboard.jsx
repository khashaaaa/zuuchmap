import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText, Users, CheckCircle, XCircle, UserCheck, UserSearch, Megaphone } from 'lucide-react'
import { adminApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getCategoryColor } from '@/lib/utils'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'
import ErrorState from '@/components/ErrorState'
import Input from '@/components/Input'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import { BarList } from '@/components/Charts'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'

/** Push-campaign form: seasonal pushes and announcements to app users. */
function BroadcastPanel({ schemas }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [userType, setUserType] = useState('')
  const [category, setCategory] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sentCount, setSentCount] = useState(null)

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.broadcast({
        title: title.trim(),
        body: body.trim(),
        user_type: userType || undefined,
        category: category || undefined,
      }),
    onSuccess: (res) => {
      setSentCount(res?.sent ?? 0)
      setConfirming(false)
      setTitle('')
      setBody('')
    },
    onError: () => setConfirming(false),
  })

  const ready = title.trim().length > 0 && body.trim().length > 0

  return (
    <section className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6 mt-6">
      <h2 className="text-sm font-semibold text-text mb-1 flex items-center gap-2">
        <Megaphone size={16} aria-hidden="true" />
        {t('admin.broadcastTitle')}
      </h2>
      <p className="text-xs text-muted mb-4">{t('admin.broadcastHint')}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder={t('admin.broadcastTitlePlaceholder')}
          aria-label={t('admin.broadcastTitlePlaceholder')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input as="select" value={userType} onChange={(e) => setUserType(e.target.value)} aria-label={t('admin.broadcastAudience')}>
            <option value="">{t('admin.broadcastAllUsers')}</option>
            <option value="PROVIDER">{t('admin.totalProviders')}</option>
            <option value="CUSTOMER">{t('admin.totalCustomers')}</option>
          </Input>
          <Input as="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('posts.category')}>
            <option value="">{t('admin.broadcastAllCategories')}</option>
            {schemas.map((s) => (
              <option key={s.key} value={s.key}>{getCategoryLabel(s.key, t, schemas)}</option>
            ))}
          </Input>
        </div>
        <Input
          as="textarea"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={300}
          placeholder={t('admin.broadcastBodyPlaceholder')}
          aria-label={t('admin.broadcastBodyPlaceholder')}
          className="md:col-span-2 resize-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3 mt-4">
        <p className="text-xs text-muted" role="status">
          {mutation.isError
            ? t('admin.broadcastError')
            : sentCount !== null
              ? t('admin.broadcastSent', { count: sentCount })
              : ''}
        </p>
        <Button size="sm" disabled={!ready || mutation.isPending} onClick={() => setConfirming(true)}>
          {t('admin.broadcastSend')}
        </Button>
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('admin.broadcastConfirmTitle')}
        message={t('admin.broadcastConfirmMessage')}
        confirmLabel={t('admin.broadcastSend')}
        confirmVariant="primary"
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </section>
  )
}

export default function AdminDashboard() {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    staleTime: 30_000,
  })
  const showSkeleton = useMinDisplayTime(isLoading)

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const categoryChartData = stats?.byType
    ? stats.byType.map((row) => ({
        key: row.postType,
        label: getCategoryLabel(row.postType, t, schemas),
        value: Number(row.total),
        secondary: Number(row.pending),
        color: getCategoryColor(row.postType, schemas),
      }))
    : []

  const userBreakdownData = stats
    ? [
        { key: 'providers', label: t('admin.totalProviders'), value: stats.totalProviders ?? 0 },
        { key: 'customers', label: t('admin.totalCustomers'), value: stats.totalCustomers ?? 0 },
      ]
    : []

  const postStatCards = [
    { icon: FileText, label: t('admin.totalPosts'), value: stats?.totals?.total, color: 'text-text' },
    { icon: CheckCircle, label: t('admin.approvedPosts'), value: stats?.totals?.approved, color: 'text-success' },
    { icon: XCircle, label: t('admin.rejectedPosts'), value: stats?.totals?.rejected, color: 'text-danger' },
  ]
  const userStatCards = [
    { icon: Users, label: t('admin.totalUsers'), value: stats?.totalUsers, color: 'text-text' },
    { icon: UserCheck, label: t('admin.totalProviders'), value: stats?.totalProviders, color: 'text-primary-text' },
    { icon: UserSearch, label: t('admin.totalCustomers'), value: stats?.totalCustomers, color: 'text-muted' },
  ]

  const overline = 'text-[11px] font-semibold uppercase tracking-wider text-muted mb-2'

  return (
    <div>
      <PageHeader title={t('admin.dashboard')} description={t('admin.subtitle')} />

      {showSkeleton ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <h2 className={overline}>{t('admin.postsSection')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
            {/* The pending queue is the number an admin acts on — it leads. */}
            <StatCard
              lead
              label={t('admin.pendingPosts')}
              value={stats?.totals?.pending ?? 0}
              color="text-text"
              index={0}
              className="col-span-2"
            />
            {postStatCards.map(({ icon, label, value, color }, i) => (
              <StatCard key={label} icon={icon} label={label} value={value ?? 0} color={color} index={i + 1} />
            ))}
          </div>

          <h2 className={`${overline} mt-6`}>{t('admin.usersSection')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
            {userStatCards.map(({ icon, label, value, color }, i) => (
              <StatCard key={label} icon={icon} label={label} value={value ?? 0} color={color} index={i + 4} />
            ))}
          </div>
        </>
      )}

      {/* An empty chart panel and a missing one look the same — say "no data"
          instead of silently dropping the section (ProviderDashboard idiom). */}
      {!showSkeleton && !isError && (
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { delay: shouldReduceMotion ? 0 : 0.3 } }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <div className="lg:col-span-2 bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-text mb-4">{t('admin.postsByCategory')}</h2>
          {categoryChartData.length === 0 ? (
            <p className="text-base text-muted text-center py-6">{t('analytics.noData')}</p>
          ) : (
            <>
              {/* BarList direct-labels values; the pending overlay still needs naming. */}
              <div className="flex items-center gap-4 mb-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-chart" aria-hidden="true" />
                  {t('admin.totalPosts')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted" aria-hidden="true" />
                  {t('admin.pendingPosts')}
                </span>
              </div>
              <BarList data={categoryChartData} label={t('admin.postsByCategory')} />
            </>
          )}
        </div>

        <div className="bg-surface border border-border/20 shadow-card rounded-card p-5 md:p-6">
          <h2 className="text-sm font-semibold text-text mb-4">{t('admin.userBreakdown')}</h2>
          {!userBreakdownData.some((d) => d.value > 0) ? (
            <p className="text-base text-muted text-center py-6">{t('analytics.noData')}</p>
          ) : (
            <BarList data={userBreakdownData} label={t('admin.userBreakdown')} />
          )}
        </div>
      </motion.div>
      )}

      {!showSkeleton && !isError && <BroadcastPanel schemas={schemas} />}
    </div>
  )
}
