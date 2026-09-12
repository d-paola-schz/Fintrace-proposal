import { useEffect, useRef, type ReactNode } from 'react'

/** A focused overlay for one task, dismissed with Escape or the backdrop. */
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
        className="absolute inset-0 cursor-default bg-[#0f1726]/20"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className={`relative mt-10 flex max-h-[calc(100%-5rem)] w-full flex-col rounded-xl border border-hair bg-white shadow-[0_18px_48px_rgba(15,23,38,0.18)] outline-none ${
          wide ? 'max-w-[880px]' : 'max-w-[620px]'
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hair px-5 py-3.5">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded px-2 py-1 text-[16px] leading-none text-muted hover:bg-[#f3f5f8] hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
