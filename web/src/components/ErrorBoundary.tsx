import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What failed, in the user's terms: "the evidence panel", "the timeline". */
  area: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * A fault in one part of the workspace must never blank the whole page.
 *
 * React unmounts the entire tree when a render throws, which previously turned
 * a single bad field into a white screen that only a reload could fix. Each
 * major region is wrapped so a failure degrades to a message in that region,
 * with the rest of the workspace — and every figure in it — still usable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[preflight] ${this.props.area} failed to render`, error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full min-h-[120px] items-center justify-center p-4">
        <div className="max-w-sm rounded-lg border border-[#ebc3ae] bg-[#fdf1ea] p-3">
          <p className="text-[12px] font-semibold text-[#8f3612]">
            {this.props.area} could not be displayed
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[#8f3612]">
            The rest of the workspace is unaffected, and no figure elsewhere on this page
            depends on it.
          </p>
          <p className="mt-1.5 font-mono text-[10px] leading-snug text-[#8f3612]/80">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-2 rounded bg-[#8f3612] px-2.5 py-1 text-[11px] font-medium text-white"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
