import type { LedgerRecord } from '../types/ledger'
import { API_BASE } from '../config/api'
import { apiRequest } from './http'

const request = apiRequest

let ledgersCache: LedgerRecord[] | null = null
let ledgersInflight: Promise<{ ledgers: LedgerRecord[] }> | null = null

export function invalidateLedgersCache() {
  ledgersCache = null
  ledgersInflight = null
}

export function fetchLedgers(): Promise<{ ledgers: LedgerRecord[] }> {
  if (ledgersCache) {
    return Promise.resolve({ ledgers: ledgersCache })
  }

  if (!ledgersInflight) {
    ledgersInflight = request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`).then((data) => {
      ledgersCache = data.ledgers
      ledgersInflight = null
      return data
    })
  }

  return ledgersInflight
}

export function saveLedgers(ledgers: LedgerRecord[]): Promise<{ ledgers: LedgerRecord[] }> {
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`, {
    method: 'PUT',
    body: JSON.stringify({ ledgers }),
  }).then((data) => {
    ledgersCache = data.ledgers
    return data
  })
}
