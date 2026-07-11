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

export function fetchLedgers(options?: { fresh?: boolean }): Promise<{ ledgers: LedgerRecord[] }> {
  if (!options?.fresh && ledgersCache) {
    return Promise.resolve({ ledgers: ledgersCache })
  }

  if (!options?.fresh && ledgersInflight) {
    return ledgersInflight
  }

  ledgersInflight = request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`).then((data) => {
    ledgersCache = (data.ledgers ?? []).map((ledger) => ({
      ...ledger,
      hasEntries: Boolean(ledger.hasEntries),
    }))
    ledgersInflight = null
    return { ledgers: ledgersCache }
  })

  return ledgersInflight
}

export function saveLedgers(ledgers: LedgerRecord[]): Promise<{ ledgers: LedgerRecord[] }> {
  const payload = ledgers.map(({ hasEntries: _hasEntries, ...ledger }) => ledger)
  return request<{ ledgers: LedgerRecord[] }>(`${API_BASE}/ledgers`, {
    method: 'PUT',
    body: JSON.stringify({ ledgers: payload }),
  }).then((data) => {
    ledgersCache = (data.ledgers ?? []).map((ledger) => ({
      ...ledger,
      hasEntries: Boolean(ledger.hasEntries),
    }))
    return { ledgers: ledgersCache }
  })
}
