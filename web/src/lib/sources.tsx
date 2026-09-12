import { createContext, useContext, useMemo } from 'react'
import type { SourceRecord } from '../types/contracts'

/**
 * Every source record in the payload, by id.
 *
 * Citations used to print their internal id — `src-olist-window` — which is
 * precise and says nothing to the person reading it. The payload already
 * carries a written title for each one, so a citation can name itself.
 */
const SourceIndexContext = createContext<Record<string, SourceRecord>>({})

export function SourceIndexProvider({
  sources,
  children,
}: {
  sources: SourceRecord[]
  children: React.ReactNode
}) {
  const index = useMemo(() => {
    const out: Record<string, SourceRecord> = {}
    for (const s of sources) out[s.id] = s
    return out
  }, [sources])
  return <SourceIndexContext.Provider value={index}>{children}</SourceIndexContext.Provider>
}

export function useSourceRecord(id: string): SourceRecord | undefined {
  return useContext(SourceIndexContext)[id]
}

/** What kind of thing a source is, in words rather than a field name. */
export const SOURCE_KIND_WORD: Record<string, string> = {
  olist_query: 'Marketplace records',
  nessie_record: 'Sandbox bank',
  assumption: 'Demo assumption',
  user_input: 'You entered',
}

/**
 * A rule id as a phrase. The id stays available for anyone checking the code,
 * but it is not what the owner should have to read.
 */
export function ruleName(ruleId: string): string {
  const bare = ruleId.replace(/^rule-/, '').replace(/-/g, ' ')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}
