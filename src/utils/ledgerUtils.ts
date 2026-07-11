import type { FsNotes } from '../types/fs'
import type { LedgerRecord, LedgerSign } from '../types/ledger'
import { NOTE_FIELDS, NOTE_GROUP_ORDER } from './fsDefaults'
import { getAdminCategoryLabel, isLegacyAdminCategoryId } from './adminExpenseCategories'
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
    hasEntries: Boolean(raw.hasEntries),
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

export function firstUnusedLedgerIdForGroup(
  ledgers: LedgerRecord[],
  group: keyof FsNotes,
  usedIds: Iterable<string>,
) {
  const used = new Set(usedIds)
  return getLedgersForGroup(ledgers, group).find((ledger) => !used.has(ledger.id))?.id ?? ''
}

export function getUnusedLedgersForGroup(
  ledgers: LedgerRecord[],
  group: keyof FsNotes,
  usedIds: Iterable<string>,
) {
  const used = new Set(usedIds)
  return getLedgersForGroup(ledgers, group).filter((ledger) => !used.has(ledger.id))
}

export function getUnusedAdminExpenseLedgers(
  ledgers: LedgerRecord[],
  usedCategoryIds: Iterable<string>,
) {
  const used = new Set(
    [...usedCategoryIds].map((categoryId) => resolveAdminExpenseCategoryId(ledgers, categoryId)),
  )
  return getLedgersForGroup(ledgers, 'otherAdministrativeExpenses').filter(
    (ledger) => !used.has(ledger.id),
  )
}

export function hasUnusedLedgerInGroup(
  ledgers: LedgerRecord[],
  group: keyof FsNotes,
  usedIds: Iterable<string>,
) {
  const used = new Set(usedIds)
  return getLedgersForGroup(ledgers, group).some((ledger) => !used.has(ledger.id))
}

function normalizeLedgerMatchName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function ledgerNameMatchesCategoryLabel(ledgerName: string, categoryLabel: string) {
  const ledger = normalizeLedgerMatchName(ledgerName)
  const category = normalizeLedgerMatchName(categoryLabel)
  if (!ledger || !category) {
    return false
  }
  if (ledger === category) {
    return true
  }
  if (ledger === category.replace(/s$/, '') || category === ledger.replace(/s$/, '')) {
    return true
  }
  return ledger.includes(category) || category.includes(ledger)
}

/** Map legacy admin category slugs (or names) to ledger ids when possible. */
export function resolveAdminExpenseCategoryId(ledgers: LedgerRecord[], categoryId: string) {
  if (!categoryId) {
    return categoryId
  }

  const group = 'otherAdministrativeExpenses' as const
  const ledger = getLedgerById(ledgers, categoryId)
  if (ledger?.group === group) {
    return categoryId
  }

  if (isLegacyAdminCategoryId(categoryId)) {
    const label = getAdminCategoryLabel(categoryId)
    const match = getLedgersForGroup(ledgers, group).find((item) =>
      ledgerNameMatchesCategoryLabel(item.name, label),
    )
    return match?.id ?? categoryId
  }

  const byName = getLedgersForGroup(ledgers, group).find(
    (item) => item.name.toLowerCase() === categoryId.toLowerCase(),
  )
  return byName?.id ?? categoryId
}

export function resolveAdminExpenseLabel(ledgers: LedgerRecord[], categoryId: string) {
  const resolvedId = resolveAdminExpenseCategoryId(ledgers, categoryId)
  return (
    getLedgerLabel(ledgers, 'otherAdministrativeExpenses', resolvedId) ||
    getAdminCategoryLabel(resolvedId)
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

export type LedgerGroupOption = ReturnType<typeof getLedgerGroupOptions>[number]

export function getLedgerSearchText(
  ledger: LedgerRecord,
  groupOption: LedgerGroupOption | undefined,
) {
  return [
    ledger.name,
    getNoteFieldLabel(ledger.group),
    groupOption?.section,
    groupOption ? String(groupOption.noteNo) : '',
    groupOption ? `Note ${groupOption.noteNo}` : '',
    normalizeLedgerSign(ledger.sign) === 'less' ? 'less deduct' : 'add',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterLedgers(
  ledgers: LedgerRecord[],
  searchQuery: string,
  groupFilter: keyof FsNotes | '',
  groupOptions: LedgerGroupOption[] = getLedgerGroupOptions(),
) {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return ledgers.filter((ledger) => {
    if (groupFilter && ledger.group !== groupFilter) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    const groupOption = groupOptions.find((item) => item.group === ledger.group)
    return getLedgerSearchText(ledger, groupOption).includes(normalizedQuery)
  })
}

export function normalizeLedgerNameKey(name: string) {
  return name.trim().toLowerCase()
}

export function ledgerDuplicateKey(ledger: Pick<LedgerRecord, 'name' | 'group'>) {
  return `${ledger.group}|${normalizeLedgerNameKey(ledger.name)}`
}

export function findDuplicateLedger(
  ledgers: LedgerRecord[],
  candidate: Pick<LedgerRecord, 'id' | 'name' | 'group'>,
): LedgerRecord | undefined {
  if (!normalizeLedgerNameKey(candidate.name)) {
    return undefined
  }

  const key = ledgerDuplicateKey(candidate)
  return ledgers.find((ledger) => ledger.id !== candidate.id && ledgerDuplicateKey(ledger) === key)
}

export function formatLedgerDuplicateError(
  name: string,
  group: keyof FsNotes,
  existing?: LedgerRecord,
) {
  const groupLabel = getNoteFieldLabel(group)
  if (existing) {
    return `Ledger name "${name}" already exists in ${groupLabel}.`
  }
  return `Duplicate ledger name "${name}" is not allowed in ${groupLabel}.`
}
