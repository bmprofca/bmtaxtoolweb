import type { LedgerRecord } from '../types/ledger'

const API_BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('authToken')
  const headers = new Headers(options?.headers)

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export function fetchLedgers(): Promise<{ ledgers: LedgerRecord[] }> {
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`)
}

export function saveLedgers(ledgers: LedgerRecord[]): Promise<{ ledgers: LedgerRecord[] }> {
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`, {
    method: 'PUT',
    body: JSON.stringify({ ledgers }),
  })
}
