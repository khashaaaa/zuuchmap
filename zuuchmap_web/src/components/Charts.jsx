import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Hand-rolled SVG charts.
 *
 * Every chart here plots a single measure, so each uses one hue (--color-chart,
 * stepped per theme to clear 3:1 against its surface) and magnitude is read from
 * length, never from color. Text stays in text tokens; the mark never colours a
 * label. No chart library — three shapes did not justify the dependency or the
 * React 19 compatibility risk.
 */

const W = 800
const H = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 44 }

/**
 * Rounds an axis maximum up to something a human would choose, and keeps it
 * even so the midpoint gridline sits on a whole number — otherwise a max of 5
 * draws its middle rule at 2.5 and labels it "3".
 */
function niceMax(value) {
  if (value <= 0) return 2
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  const max = step * magnitude
  return max % 2 === 0 ? max : max + magnitude
}

const fmtDay = (iso) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function useHoverIndex(count) {
  const ref = useRef(null)
  const [index, setIndex] = useState(null)

  const onMove = useCallback((e) => {
    const svg = ref.current
    if (!svg || !count) return
    const rect = svg.getBoundingClientRect()
    // Map client x into viewBox space — the SVG scales with its container.
    const x = ((e.clientX - rect.left) / rect.width) * W
    const plotW = W - PAD.left - PAD.right
    const ratio = (x - PAD.left) / plotW
    const i = Math.round(ratio * (count - 1))
    setIndex(i >= 0 && i < count ? i : null)
  }, [count])

  return { ref, index, onMove, onLeave: () => setIndex(null) }
}

function Tooltip({ label, value, unit, x }) {
  // Flip the anchor near the right edge so the card never overflows the plot.
  const flip = x > W * 0.62
  return (
    <foreignObject x={flip ? x - 158 : x + 10} y={16} width="150" height="62">
      <div className="rounded-btn bg-surface2 border border-border/40 px-2.5 py-1.5 shadow-card">
        <p className="text-xs text-muted leading-tight">{label}</p>
        <p className="text-sm font-semibold text-text tabular-nums leading-tight">
          {value}{unit ? <span className="text-xs font-normal text-muted"> {unit}</span> : null}
        </p>
      </div>
    </foreignObject>
  )
}

function GridAndAxis({ max, ticks, points, everyNth }) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => {
        const y = PAD.top + (1 - tick / max) * (H - PAD.top - PAD.bottom)
        return (
          <g key={tick}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="var(--color-border)" strokeOpacity="0.18" strokeWidth="1"
            />
            <text
              x={PAD.left - 8} y={y + 3} textAnchor="end"
              fontSize="10" fill="var(--color-muted)"
            >
              {tick}
            </text>
          </g>
        )
      })}
      {points.map((p, i) => (
        i % everyNth === 0 ? (
          <text
            key={p.day} x={p.x} y={H - PAD.bottom + 16} textAnchor="middle"
            fontSize="10" fill="var(--color-muted)"
          >
            {fmtDay(p.day)}
          </text>
        ) : null
      ))}
    </g>
  )
}

/** Change over time, one series. Crosshair + tooltip on hover. */
export function LineChart({ data = [], label, unit }) {
  const { t } = useTranslation()
  const { ref, index, onMove, onLeave } = useHoverIndex(data.length)
  if (!data.length) return <ChartEmpty />

  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const points = data.map((d, i) => ({
    ...d,
    x: PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y: PAD.top + (1 - d.value / max) * plotH,
  }))

  const line = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `${PAD.left},${H - PAD.bottom} ${line} ${W - PAD.right},${H - PAD.bottom}`
  const active = index != null ? points[index] : null
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={t('chart.summaryPeak', {
        label, total, days: data.length, peak: Math.max(...data.map((d) => d.value)),
      })}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <GridAndAxis
        max={max}
        ticks={[0, max / 2, max].map(Math.round)}
        points={points}
        everyNth={Math.ceil(data.length / 7)}
      />

      <polygon points={area} fill="var(--color-chart)" fillOpacity="0.10" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-chart)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {active && (
        <>
          <line
            x1={active.x} x2={active.x} y1={PAD.top} y2={H - PAD.bottom}
            stroke="var(--color-border)" strokeOpacity="0.5" strokeWidth="1"
          />
          {/* Surface ring keeps the marker legible wherever it lands. */}
          <circle cx={active.x} cy={active.y} r="5" fill="var(--color-chart)" stroke="var(--color-surface)" strokeWidth="2" />
          <Tooltip label={active.day} value={active.value} unit={unit} x={active.x} />
        </>
      )}
    </svg>
  )
}

/** Volume over time. Same data shape as LineChart, discrete reading. */
export function ColumnChart({ data = [], label, unit }) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(null)
  if (!data.length) return <ChartEmpty />

  const max = niceMax(Math.max(...data.map((d) => d.value), 1))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / data.length
  // 2px gap between adjacent bars, but cap the width so a single day (or a
  // handful) reads as a bar centred in its slot rather than one giant block.
  const barW = Math.min(Math.max(2, slot - 2), 56)

  const points = data.map((d, i) => ({ ...d, x: PAD.left + i * slot + slot / 2 }))
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={t('chart.summary', { label, total, days: data.length })}
      onMouseLeave={() => setHover(null)}
    >
      <GridAndAxis
        max={max}
        ticks={[0, max / 2, max].map(Math.round)}
        points={points}
        everyNth={Math.ceil(data.length / 7)}
      />

      {data.map((d, i) => {
        const h = (d.value / max) * plotH
        const x = PAD.left + i * slot + (slot - barW) / 2
        const y = H - PAD.bottom - h
        return (
          <g key={d.day} onMouseEnter={() => setHover(i)}>
            {/* Full-height hit target so thin bars stay easy to hover. */}
            <rect x={x} y={PAD.top} width={barW} height={plotH} fill="transparent" />
            <rect
              x={x} y={y} width={barW} height={Math.max(h, d.value > 0 ? 2 : 0)}
              rx={Math.min(4, barW / 2)}
              fill="var(--color-chart)"
              fillOpacity={hover === null || hover === i ? 1 : 0.45}
              className="chart-grow-y"
              style={{ animationDelay: `${Math.min(i * 12, 240)}ms` }}
            />
          </g>
        )
      })}

      {hover != null && (
        <Tooltip label={data[hover].day} value={data[hover].value} unit={unit} x={points[hover].x} />
      )}
    </svg>
  )
}

/**
 * Magnitude by identity — horizontal so long Mongolian labels stay readable.
 * Values are direct-labelled, so no axis and no legend.
 *
 * An item may carry `secondary`, a subset of `value` (e.g. pending within
 * total): it overlays the bar in the muted tone and is direct-labelled after
 * the value. Still one measure per hue — the caller supplies the legend.
 */
export function BarList({ data = [], label, emptyLabel }) {
  if (!data.length) return <ChartEmpty label={emptyLabel} />
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <ul className="space-y-2.5" aria-label={label}>
      {data.map((d, i) => (
        <li key={d.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
          <span className="text-xs text-muted truncate" title={d.label}>{d.label}</span>
          <span className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
            <span
              className="block h-full rounded-full bg-chart chart-grow-x"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`, animationDelay: `${Math.min(i * 30, 300)}ms` }}
            />
            {d.secondary != null && (
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-muted chart-grow-x"
                style={{ width: `${Math.max((d.secondary / max) * 100, d.secondary > 0 ? 2 : 0)}%`, animationDelay: `${Math.min(i * 30, 300)}ms` }}
              />
            )}
          </span>
          <span className="text-xs font-semibold text-text tabular-nums min-w-10 text-right">
            {d.value}
            {d.secondary != null && <span className="font-normal text-muted"> · {d.secondary}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Ordered stages with drop-off. Each row is labelled with its own conversion
 * from the stage above, which is the number an operator actually acts on.
 */
export function Funnel({ stages = [] }) {
  const top = stages[0]?.value ?? 0
  if (!top) return <ChartEmpty />

  return (
    <ol className="space-y-2.5">
      {stages.map((stage, i) => {
        // Conversion is measured against the top of the funnel ("of everyone
        // who reached step 1, how many got here") — a monotonic 0–100%. Measuring
        // against the previous stage produced >100% when steps aren't strict
        // prerequisites, and 0/0 read as 100%. `top` is > 0 (early return).
        const pct = i === 0 ? null : Math.round((stage.value / top) * 100)
        return (
          <li key={stage.key} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3">
            <span className="text-xs text-muted truncate" title={stage.label}>{stage.label}</span>
            <span className="h-2.5 rounded-full bg-surface2 overflow-hidden">
              <span
                className="block h-full rounded-full bg-chart chart-grow-x"
                style={{ width: `${Math.max((stage.value / top) * 100, stage.value > 0 ? 2 : 0)}%`, animationDelay: `${Math.min(i * 30, 300)}ms` }}
              />
            </span>
            <span className="text-xs tabular-nums text-right w-20">
              <span className="font-semibold text-text">{stage.value}</span>
              {pct != null && <span className="text-muted"> · {pct}%</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ChartEmpty({ label }) {
  return (
    <div className="h-32 flex items-center justify-center text-xs text-muted">
      {label ?? '—'}
    </div>
  )
}

/** Accessible fallback: the same numbers as a real table. */
export function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted border-b border-border/25">
            {columns.map((c) => <th key={c} className="py-1.5 pr-4 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/10 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`py-1.5 pr-4 ${j === 0 ? 'text-text' : 'text-muted tabular-nums'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
