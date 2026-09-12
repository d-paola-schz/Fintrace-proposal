import type {
  ChatRequest, ChatResponse, ScenarioRequest, SourceRecord, WorkspaceResponse,
} from '../types/contracts'

const TIMEOUT_MS = 20_000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  workspace: () => request<WorkspaceResponse>('/api/workspace'),
  scenario: (req: ScenarioRequest) =>
    request<WorkspaceResponse>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  chat: (req: ChatRequest) =>
    request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(req) }),
  source: (id: string) => request<SourceRecord>(`/api/sources/${encodeURIComponent(id)}`),
}
