import type { FsNotes } from './fs'

export type LedgerSign = 'add' | 'less'

export interface LedgerRecord {
  id: string
  name: string
  group: keyof FsNotes
  sign?: LedgerSign
  /** True when any client/FY has non-zero note or depreciation entries for this ledger. */
  hasEntries?: boolean
}
