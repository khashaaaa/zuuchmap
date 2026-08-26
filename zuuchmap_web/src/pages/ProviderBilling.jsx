import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { paymentsApi, usersApi } from '@/lib/api'
import { formatPrice, goBack } from '@/lib/utils'

const MONTH_CHOICES = [1, 3, 6, 12]
/** QPay settles in seconds, but a bank app can sit on it — poll for two minutes. */
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 120000

/**
 * Buy plan time.
 *
 * The plan itself has been enforced server-side all along — quota, expiry,
 * degrade-on-lapse — but the only way into it was an admin toggling a flag
 * after reconciling a bank transfer by hand. This is the till.
 *
 * Payment is confirmed by the server asking QPay, never by this screen: the
 * poll below only reads the answer the engine has already verified.
 */
export default function ProviderBilling() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [months, setMonths] = useState(1)
  const [invoice, setInvoice] = useState(null)
  const [paid, setPaid] = useState(false)

  const { data: catalogue } = useQuery({
    queryKey: ['payments', 'catalogue'],
    queryFn: paymentsApi.catalogue,
  })
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: usersApi.getProfile })
  const { data: history = [] } = useQuery({ queryKey: ['payments', 'mine'], queryFn: paymentsApi.mine })

  const paidPlan = catalogue?.plans?.find((p) => p.plan === 'PROVIDER')
  const unitPrice = paidPlan?.monthly_price ?? 0
  const expiresAt = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null
  const planActive = profile?.plan === 'PROVIDER' && expiresAt && expiresAt > new Date()

  const createMut = useMutation({
    mutationFn: () => paymentsApi.createInvoice('PROVIDER', months),
    onSuccess: (data) => {
      setPaid(false)
      setInvoice(data)
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message === 'PAYMENTS_NOT_CONFIGURED'
          ? t('billing.notConfigured')
          : t('billing.failed')
      )
    },
  })

  // Poll while the QR is on screen. Stops on success, on close, and after two
  // minutes — an interval left running behind a closed dialog is a request
  // every three seconds forever.
  useEffect(() => {
    if (!invoice?.payment_id || paid) return
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer)
        return
      }
      try {
        const result = await paymentsApi.check(invoice.payment_id)
        if (result?.status === 'PAID') {
          clearInterval(timer)
          setPaid(true)
          qc.invalidateQueries({ queryKey: ['profile'] })
          qc.invalidateQueries({ queryKey: ['payments', 'mine'] })
          qc.invalidateQueries({ queryKey: ['posts', 'mine'] })
        }
      } catch {
        // A failed poll is not a failed payment — the hourly sweep settles an
        // invoice whose confirmation never reached this tab.
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [invoice?.payment_id, paid, qc])

  const closeInvoice = () => {
    setInvoice(null)
    setPaid(false)
  }

  const dateStr = (value) =>
    new Date(value).toLocaleDateString(i18n.language === 'mn' ? 'mn-MN' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    })

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('billing.title')}
        description={t('billing.description')}
        icon={CreditCard}
        onBack={() => goBack(navigate, '/provider')}
      />

      <section className="rounded-card bg-surface p-4 mb-6">
        <p className="text-xs uppercase tracking-wide text-muted">{t('billing.currentPlan')}</p>
        <p className="text-xl font-bold text-text mt-1">{profile?.plan ?? 'FREE'}</p>
        <p className="text-sm text-muted mt-1">
          {planActive
            ? t('billing.expiresOn', { date: dateStr(expiresAt) })
            : t('billing.postsLimit', { count: catalogue?.plans?.find((p) => p.plan === 'FREE')?.posts ?? 3 })}
        </p>
      </section>

      {catalogue?.enabled === false ? (
        <p className="text-sm text-muted rounded-card bg-surface p-4">{t('billing.notConfigured')}</p>
      ) : (
        <section className="rounded-card bg-surface p-4 mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="font-semibold text-text">PROVIDER</p>
              <p className="text-sm text-muted">{t('billing.postsLimit', { count: paidPlan?.posts ?? 25 })}</p>
            </div>
            <p className="text-lg font-bold text-primary-text">{formatPrice(unitPrice)}</p>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs uppercase tracking-wide text-muted mb-2">{t('billing.months')}</legend>
            <div className="flex gap-2 flex-wrap">
              {MONTH_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  aria-pressed={months === m}
                  className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
                    months === m ? 'bg-primary text-on-primary' : 'bg-surface2 text-text hover:bg-border/20'
                  }`}
                >
                  {t('billing.monthsValue', { count: m })}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40">
            <span className="text-sm text-muted">{t('billing.total')}</span>
            <span className="text-lg font-bold text-text">{formatPrice(unitPrice * months)}</span>
          </div>

          <Button
            className="w-full mt-4"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || unitPrice <= 0}
          >
            {createMut.isPending ? t('billing.creating') : t('billing.payWithQpay')}
          </Button>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-text mb-2">{t('billing.history')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t('billing.noHistory')}</p>
        ) : (
          <ul className="space-y-2">
            {history.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-card bg-surface p-3">
                <div className="min-w-0">
                  <p className="text-sm text-text truncate">
                    {p.plan} · {t('billing.monthsValue', { count: p.months })}
                  </p>
                  <p className="text-xs text-muted">
                    {t('billing.reference')}: {p.reference ?? p.id.slice(0, 8)} · {dateStr(p.date_created)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-text">{formatPrice(p.amount)}</p>
                  <p className={`text-xs ${p.status === 'PAID' ? 'text-success' : 'text-muted'}`}>{p.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={Boolean(invoice)} onClose={closeInvoice} title={t('billing.payWithQpay')}>
        {paid ? (
          <div className="text-center py-6">
            <CheckCircle2 size={40} className="text-success mx-auto" />
            <p className="font-semibold text-text mt-3">{t('billing.paid')}</p>
            <p className="text-sm text-muted mt-1">{t('billing.paidHint')}</p>
            <Button className="mt-4" onClick={closeInvoice}>{t('common.close')}</Button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted">{t('billing.scanQr')}</p>
            {invoice?.qr_image && (
              <img
                src={invoice.qr_image.startsWith('data:') ? invoice.qr_image : `data:image/png;base64,${invoice.qr_image}`}
                alt=""
                className="w-56 h-56 mx-auto my-4 rounded-card bg-white p-2"
              />
            )}
            <p className="text-lg font-bold text-text">{formatPrice(invoice?.amount ?? 0)}</p>

            {invoice?.urls?.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-wide text-muted mt-4 mb-2">{t('billing.openBankApp')}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {invoice.urls.map((u) => (
                    <a
                      key={u.link}
                      href={u.link}
                      className="px-3 py-1.5 rounded-btn bg-surface2 text-text text-xs font-medium hover:bg-border/20"
                    >
                      {u.name}
                    </a>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-muted mt-4" role="status">{t('billing.waitingForPayment')}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
