import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ChartSpec } from '../types/contracts'
import { shortDate, usd, usdCompact } from '../lib/format'
import { ProvenanceChip } from './Tone'

/** A chart only ever appears inside the answer or node it supports, and always
 *  shows its dates, its currency, its threshold and a text summary. */
export function ContextChart({ spec }: { spec: ChartSpec }) {
  const points = spec.points ?? []
  if (points.length === 0) return null

  const data = points.map((p) => ({
    date: p.date,
    label: shortDate(p.date),
    value: p.amountCents / 100,
  }))
  const threshold = spec.thresholdCents != null ? spec.thresholdCents / 100 : undefined
  const values = data.map((d) => d.value)
  const lo = Math.min(...values, threshold ?? Infinity)
  const hi = Math.max(...values, threshold ?? -Infinity)
  const pad = Math.max(1, (hi - lo) * 0.18)
  // Round the axis to a readable step so ticks land on whole hundreds.
  const step = hi - lo > 20_000 ? 5_000 : hi - lo > 4_000 ? 1_000 : 500
  const domainLo = Math.floor((lo - pad) / step) * step
  const domainHi = Math.ceil((hi + pad) / step) * step

  const lowest = points.reduce((a, b) => (b.amountCents < a.amountCents ? b : a), points[0])

  return (
    <figure className="rounded-lg border border-hair bg-white p-3">
      <figcaption className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
            {spec.title}
          </h4>
          <ProvenanceChip provenance={spec.provenance} />
        </div>
      </figcaption>

      <div style={{ height: 132 }}>
        <ResponsiveContainer width="100%" height="100%">
          {spec.kind === 'cash_projection' ? (
            <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="cashfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f5" vertical={false} />
              <XAxis
                dataKey="label" tick={{ fontSize: 9.5, fill: '#8b95a4' }}
                interval={Math.max(1, Math.floor(data.length / 6))}
                tickLine={false} axisLine={{ stroke: '#e3e8ef' }}
              />
              <YAxis
                tick={{ fontSize: 9.5, fill: '#8b95a4' }} tickLine={false} axisLine={false}
                domain={[domainLo, domainHi]}
                tickFormatter={(v) => usdCompact(Number(v) * 100)}
                width={46}
              />
              <Tooltip
                formatter={(v) => [usd(Math.round(Number(v) * 100)), 'Projected cash']}
                labelFormatter={(l) => String(l)}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e3e8ef' }}
              />
              {threshold != null && (
                <ReferenceLine
                  y={threshold} stroke="#ad4318" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{
                    value: `Reserve ${usd(spec.thresholdCents!)}`,
                    position: 'insideBottomLeft', fontSize: 9.5, fill: '#8f3612',
                  }}
                />
              )}
              <Area
                type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2}
                fill="url(#cashfill)" dot={false} isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#eef1f5" vertical={false} />
              <XAxis
                dataKey="label" tick={{ fontSize: 9.5, fill: '#8b95a4' }}
                tickLine={false} axisLine={{ stroke: '#e3e8ef' }}
              />
              <YAxis
                tick={{ fontSize: 9.5, fill: '#8b95a4' }} tickLine={false} axisLine={false}
                tickFormatter={(v) => usdCompact(Number(v) * 100)} width={46}
              />
              <Tooltip
                formatter={(v) => [usd(Math.round(Number(v) * 100)), 'Item sales']}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e3e8ef' }}
              />
              <Bar dataKey="value" fill="#b3860a" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted">{spec.caption}</p>
      <p className="sr-only">
        {spec.kind === 'cash_projection'
          ? `Projected cash from ${shortDate(points[0].date)} to ${shortDate(
              points[points.length - 1].date,
            )} in ${spec.currency}. The lowest point is ${usd(lowest.amountCents)} on ${shortDate(
              lowest.date,
            )}${threshold != null ? `, against a reserve of ${usd(spec.thresholdCents!)}` : ''}.`
          : `Item sales by week in ${spec.currency}, from ${shortDate(points[0].date)} to ${shortDate(
              points[points.length - 1].date,
            )}.`}
      </p>
    </figure>
  )
}
