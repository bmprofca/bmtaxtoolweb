import type { FsNotes } from '../types/fs'
import type { LedgerRecord, LedgerSign } from '../types/ledger'
import { NOTE_FIELDS, NOTE_GROUP_ORDER } from './fsDefaults'
import { getAdminCategoryLabel } from './adminExpenseCategories'
import { getManualNoteLineLabel, type ManualNoteLineKey } from './manualNoteLineConfig'
import { getOtherShortTermBorrowingLabel } from './otherShortTermBorrowingTypes'
import {
  formatCapitalAccountLineLabel,
  type CapitalAccountLineSign,
} from './capitalAccountLineConfig'

export function generateLedgerId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function ledgerSubId(ledgerId: string) {
  return `ledger-${ledgerId}`
}

export function isLedgerSubId(subId: string) {
  return subId.startsWith('ledger-')
}

export function ledgerIdFromSubId(subId: string) {
  return subId.replace('ledger-', '')
}

export function normalizeLedgerSign(sign: string | undefined): LedgerSign {
  return sign === 'less' ? 'less' : 'add'
}

export function formatLedgerRowLabel(ledger: LedgerRecord) {
  const sign = normalizeLedgerSign(ledger.sign)
  if (ledger.group === 'capitalAccount') {
    return sign === 'less' ? `Less: ${ledger.name}` : `Add: ${ledger.name}`
  }
  if (sign === 'less') {
    return `Less: ${ledger.name}`
  }
  return ledger.name
}

export function normalizeLedgerRecord(raw: LedgerRecord): LedgerRecord | null {
  const name = raw.name?.trim() ?? ''
  if (!name) {
    return null
  }

  const field = NOTE_FIELDS.find((item) => item.key === raw.group)
  return {
    id: raw.id || generateLedgerId(),
    name,
    group: field?.key ?? 'otherAdministrativeExpenses',
    sign: normalizeLedgerSign(raw.sign),
  }
}

export function normalizeLedgers(raw: LedgerRecord[] | undefined): LedgerRecord[] {
  if (!raw?.length) {
    return []
  }

  return raw
    .map((item) => normalizeLedgerRecord(item))
    .filter((item): item is LedgerRecord => item !== null)
}

export function getLedgersForGroup(ledgers: LedgerRecord[], group: keyof FsNotes) {
  return ledgers.filter((item) => item.group === group)
}

export function getFixedAssetLedgers(ledgers: LedgerRecord[]) {
  return getLedgersForGroup(ledgers, 'depreciationAmortization').filter(
    (item) => normalizeLedgerSign(item.sign) === 'add',
  )
}

export function getLedgerById(ledgers: LedgerRecord[], ledgerId: string | undefined) {
  if (!ledgerId) {
    return undefined
  }
  return ledgers.find((item) => item.id === ledgerId)
}

export function getLedgerLabel(
  ledgers: LedgerRecord[],
  group: keyof FsNotes,
  ledgerId: string | undefined,
  fallback = 'Others',
) {
  const ledger = getLedgerById(ledgers, ledgerId)
  if (ledger && ledger.group === group) {
    return ledger.name
  }
  return fallback
}

export function defaultLedgerIdForGroup(ledgers: LedgerRecord[], group: keyof FsNotes) {
  return getLedgersForGroup(ledgers, group)[0]?.id ?? ''
}

export function resolveAdminExpenseLabel(ledgers: LedgerRecord[], categoryId: string) {
  return (
    getLedgerLabel(ledgers, 'otherAdministrativeExpenses', categoryId) ||
    getAdminCategoryLabel(categoryId)
  )
}

export function resolveManualNoteLineLabel(
  ledgers: LedgerRecord[],
  noteKey: ManualNoteLineKey,
  typeId: string,
) {
  return getLedgerLabel(ledgers, noteKey, typeId) || getManualNoteLineLabel(noteKey, typeId)
}

export function resolveShortTermBorrowingLabel(ledgers: LedgerRecord[], typeId: string) {
  return (
    getLedgerLabel(ledgers, 'shortTermBorrowings', typeId) ||
    getOtherShortTermBorrowingLabel(typeId)
  )
}

export function resolveCapitalAccountLineLabel(
  ledgers: LedgerRecord[],
  sign: CapitalAccountLineSign,
  typeId: string,
) {
  const ledgerLabel = getLedgerLabel(ledgers, 'capitalAccount', typeId)
  if (ledgerLabel !== 'Others') {
    return sign === 'add' ? `Add: ${ledgerLabel}` : `Less: ${ledgerLabel}`
  }
  return formatCapitalAccountLineLabel(sign, typeId)
}

export function getNoteFieldLabel(group: keyof FsNotes) {
  return NOTE_FIELDS.find((item) => item.key === group)?.label ?? group
}

export function getLedgerGroupOptions() {
  return NOTE_GROUP_ORDER.flatMap((groupName) =>
    NOTE_FIELDS.filter((field) => field.group === groupName).map((field) => ({
      group: field.key,
      label: field.label,
      section: groupName,
      noteNo: field.noteNo,
    })),
  )
}
