import type { LedgerRecord } from '../types/ledger'
import { API_BASE } from '../config/api'
import { apiRequest } from './http'

const request = apiRequest

export function fetchLedgers(): Promise<{ ledgers: LedgerRecord[] }> {
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`)
}

export function saveLedgers(ledgers: LedgerRecord[]): Promise<{ ledgers: LedgerRecord[] }> {
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`, {
    method: 'PUT',
    body: JSON.stringify({ ledgers }),
  })
}
