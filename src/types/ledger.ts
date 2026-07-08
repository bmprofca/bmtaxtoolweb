import type { FsNotes } from './fs'

export type LedgerSign = 'add' | 'less'

export interface LedgerRecord {
  id: string
  name: string
  group: keyof FsNotes
  sign?: LedgerSign
}
