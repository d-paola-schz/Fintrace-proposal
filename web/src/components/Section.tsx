import { useState, type ReactNode } from 'react'

/**
 * One band of the detail panel.
 *
 * The panel carries a lot of genuinely useful material, and previously all of
 * it sat at the same visual weight, so nothing led. Sections now have a clear
 * rank: the ones that answer "what is going on" stay open, the ones that
 * answer "how do you know" collapse to a labelled row with a count, so the
 * material is a click away rather than in the way.
 */
export function Section({
  title,
  count,
  tone = 'default',
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  tone?: 'default' | 'action'
  collapsible?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isAction = tone === 'action'

  const heading = (
    <span className="flex w-full items-center gap-2">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.09em] ${
          isAction ? 'text-[#54397e]' : 'text-muted'
        }`}
      >
        {title}
      </span>
      {count != null && (
        <span className="tnum rounded-full bg-[#eef1f5] px-1.5 text-[9.5px] font-semibold text-[#5a6675]">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-hair" />
      {collapsible && (
        <span className="text-[9.5px] text-muted">{open ? 'hide' : 'show'}</span>
      )}
    </span>
  )

  return (
    <section className={isAction ? 'mt-4' : 'mt-3.5'}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mb-1.5 flex w-full items-center text-left"
        >
          {heading}
        </button>
      ) : (
        <div className="mb-1.5">{heading}</div>
      )}
      {open && children}
    </section>
  )
}
