import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCompareArrows } from 'lucide-react'
import { formatPriceParts, getFieldLabel, getOptionLabel, getSubcategoryLabel, getImageUrl, hideBrokenImage } from '@/lib/utils'

const WORD_DIFF_LIMIT = 600

// Word-level diff by LCS over whitespace-delimited tokens. Quadratic, so it is
// only used below WORD_DIFF_LIMIT tokens; longer texts fall back to plain
// before/after columns, which is still a diff — just one the eye does.
function tokenDiff(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean)
  const B = b.split(/(\s+)/).filter(Boolean)
  if (A.length + B.length > WORD_DIFF_LIMIT) return null
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const before = [], after = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { before.push({ t: A[i] }); after.push({ t: B[j] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { before.push({ t: A[i], del: true }); i++ }
    else { after.push({ t: B[j], add: true }); j++ }
  }
  while (i < n) before.push({ t: A[i++], del: true })
  while (j < m) after.push({ t: B[j++], add: true })
  return { before, after }
}

function Marked({ parts }) {
  return parts.map((p, i) => p.del
    ? <mark key={i} className="bg-danger/20 text-danger-text rounded-sm line-through decoration-danger/60">{p.t}</mark>
    : p.add
      ? <mark key={i} className="bg-success/20 text-success-text rounded-sm">{p.t}</mark>
      : <span key={i}>{p.t}</span>)
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function Cell({ tone, label, children }) {
  return (
    <div className={`min-w-0 rounded-lg px-3 py-2 text-sm ${tone === 'before' ? 'bg-danger/5' : 'bg-success/5'}`}>
      <p className={`text-[10px] uppercase tracking-wide mb-1 ${tone === 'before' ? 'text-danger-text' : 'text-success-text'}`}>{label}</p>
      <div className="text-text break-words whitespace-pre-wrap">{children}</div>
    </div>
  )
}

function Row({ name, before, after }) {
  const { t } = useTranslation()
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <p className="text-xs font-medium text-muted mb-1.5">{name}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Cell tone="before" label={t('admin.diffBefore')}>{before}</Cell>
        <Cell tone="after" label={t('admin.diffAfter')}>{after}</Cell>
      </div>
    </div>
  )
}

const Dash = () => <span className="text-muted">—</span>

/**
 * "What changed" for a post that came back to the queue after an edit. Only
 * the fields that differ are listed, so the admin re-reads the delta instead
 * of the whole post — the version they already approved does not need
 * re-approving. Renders nothing when there is no snapshot.
 */
export default function PostDiff({ post, schema }) {
  const { t } = useTranslation()
  const snap = post?.previous_snapshot

  const rows = useMemo(() => {
    if (!snap) return []
    const out = []
    const val = (v) => isEmpty(v) ? <Dash /> : String(v)

    if (!same(snap.title, post.title)) {
      out.push({ key: 'title', name: t('posts.title'), before: val(snap.title), after: val(post.title) })
    }
    if (!same(snap.details, post.details)) {
      const d = tokenDiff(snap.details ?? '', post.details ?? '')
      out.push({
        key: 'details', name: t('posts.details'),
        before: d ? <Marked parts={d.before} /> : val(snap.details),
        after: d ? <Marked parts={d.after} /> : val(post.details),
      })
    }
    const snapPrice = snap.price ?? snap.price_amount
    const snapUnit = snap.price_unit
    if (!same(snapPrice, post.price_amount) || !same(snapUnit, post.price_unit)) {
      const fmt = (a, u) => { const p = formatPriceParts(a, u, t); return p ? [p.amount, p.unit].filter(Boolean).join(' / ') : <Dash /> }
      out.push({ key: 'price', name: t('posts.priceAmount'), before: fmt(snapPrice, snapUnit), after: fmt(post.price_amount, post.price_unit) })
    }
    if (!same(snap.subcategory, post.subcategory)) {
      out.push({
        key: 'subcategory', name: t('posts.subcategory'),
        before: isEmpty(snap.subcategory) ? <Dash /> : getSubcategoryLabel(snap.subcategory, t, schema),
        after: isEmpty(post.subcategory) ? <Dash /> : getSubcategoryLabel(post.subcategory, t, schema),
      })
    }
    if (!same(snap.province, post.province) || !same(snap.district, post.district)) {
      const loc = (p) => [
        p?.district && t(`district.${p.district}`, { defaultValue: p.district }),
        p?.province && t(`province.${p.province}`, { defaultValue: p.province }),
      ].filter(Boolean).join(', ') || <Dash />
      out.push({ key: 'location', name: t('posts.location'), before: loc(snap), after: loc(post) })
    }
    const prevAttrs = snap.attributes ?? {}
    const nextAttrs = post.attributes ?? {}
    const keys = Array.from(new Set([...Object.keys(prevAttrs), ...Object.keys(nextAttrs)]))
    const show = (v) => {
      if (isEmpty(v)) return <Dash />
      if (typeof v === 'boolean') return v ? t('common.yes', { defaultValue: 'Yes' }) : t('common.no', { defaultValue: 'No' })
      if (Array.isArray(v)) return v.map((o) => getOptionLabel(o, t)).join(', ')
      return getOptionLabel(v, t)
    }
    for (const k of keys) {
      if (same(prevAttrs[k], nextAttrs[k])) continue
      if (isEmpty(prevAttrs[k]) && isEmpty(nextAttrs[k])) continue
      const def = schema?.fields?.find((f) => f.key === k) ?? { key: k, label: k.replace(/_/g, ' ') }
      const unit = def.unit ? ` ${def.unit}` : ''
      out.push({
        key: `attr.${k}`, name: getFieldLabel(def, t),
        before: <>{show(prevAttrs[k])}{!isEmpty(prevAttrs[k]) && unit}</>,
        after: <>{show(nextAttrs[k])}{!isEmpty(nextAttrs[k]) && unit}</>,
      })
    }
    return out
  }, [snap, post, schema, t])

  const images = useMemo(() => {
    if (!snap) return null
    const prev = Array.isArray(snap.images) ? snap.images : []
    const next = Array.isArray(post.images) ? post.images : []
    const removed = prev.filter((u) => !next.includes(u))
    const added = next.filter((u) => !prev.includes(u))
    return removed.length || added.length ? { removed, added } : null
  }, [snap, post])

  if (!snap) return null
  const count = rows.length + (images ? 1 : 0)

  return (
    <section className="rounded-card border border-primary/30 bg-primary/5 p-4" aria-labelledby="post-diff-title">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id="post-diff-title" className="flex items-center gap-2 text-sm font-semibold text-text">
          <GitCompareArrows size={16} className="text-primary-text" />
          {t('admin.diffTitle')}
        </h2>
        <span className="text-xs text-muted">
          {count ? t('admin.diffCount', { count }) : t('admin.diffEmpty')}
        </span>
      </div>
      {count > 0 && (
        <div className="divide-y divide-border/30">
          {rows.map((r) => <Row key={r.key} name={r.name} before={r.before} after={r.after} />)}
          {images && (
            <div className="py-3 first:pt-0 last:pb-0">
              <p className="text-xs font-medium text-muted mb-1.5">{t('posts.images')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Cell tone="before" label={`${t('admin.diffRemoved')} (${images.removed.length})`}>
                  {images.removed.length ? <Thumbs urls={images.removed} dim /> : <Dash />}
                </Cell>
                <Cell tone="after" label={`${t('admin.diffAdded')} (${images.added.length})`}>
                  {images.added.length ? <Thumbs urls={images.added} /> : <Dash />}
                </Cell>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Thumbs({ urls, dim }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((u) => (
        <img
          key={u}
          src={getImageUrl(u)}
          alt=""
          loading="lazy"
          onError={hideBrokenImage}
          className={`w-14 h-14 rounded-md object-cover bg-surface2 ${dim ? 'opacity-60 grayscale' : ''}`}
        />
      ))}
    </div>
  )
}
