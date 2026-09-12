import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A focused overlay for one task, dismissed with Escape or the backdrop.
 *
 * It wears the same clothes as the step deck — floating, rounded, frosted, over
 * a blurred backdrop — so the whole workspace speaks one language. It is not
 * dealt as cards, because these are tasks rather than narratives: a purchase
 * form or a source reference wants to be seen at once, not walked through.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#0f1726]/20 backdrop-blur-sm"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className={`deck-in relative mt-10 flex max-h-[calc(100%-5rem)] w-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/88 shadow-[0_18px_48px_-12px_rgba(15,23,38,0.28),0_2px_8px_rgba(15,23,38,0.06)] outline-none backdrop-blur-2xl focus-visible:outline-none ${
          wide ? 'max-w-[880px]' : 'max-w-[620px]'
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hair/70 px-5 py-3.5">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded px-2.5 py-1.5 text-[17px] leading-none text-muted hover:bg-[#f2f4f9] hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
