import type { FsNotes, NoteSubAmounts } from '../types/fs'
import { isClosingStockLinkedInventoriesSub, isOpeningStockLinkedFromPriorYear, isOpeningStockLinkedSub } from './closingStockLink'
import type { OpeningBalanceLocks } from './openingBalanceCarryForward'
import { isNoteOpeningSubLocked } from './openingBalanceCarryForward'
import type { NoteSubFieldDef } from './noteSubFields'

/**
 * Current-year Notes to Accounts editability (accounting rules).
 *
 * Read-only current column only for amounts sourced from other schedules/tabs
 * or prior-year closing links — everything else is manual entry.
 */
export function isManualEntrySubId(subId: string): boolean {
  return (
    subId.startsWith('manual-nl-') ||
    subId.startsWith('admin-line-') ||
    subId.startsWith('manual-st-') ||
    subId.startsWith('capital-line-')
  )
}

export function isOpeningCapitalLinkedFromPriorYear(
  previousYearSubAmounts: NoteSubAmounts | null | undefined,
): boolean {
  const priorClosing = previousYearSubAmounts?.capitalAccount?.['capital-closing']?.current ?? 0
  return priorClosing !== 0
}

export function isNoteSubCurrentYearReadOnly(
  noteKey: keyof FsNotes,
  def: Pick<NoteSubFieldDef, 'id' | 'kind'>,
  options: {
    openingBalanceLocks?: OpeningBalanceLocks | null
    previousYearSubAmounts?: NoteSubAmounts | null
    linkGstSales?: boolean
  } = {},
): boolean {
  if (def.kind !== 'entry' && def.kind !== 'less') {
    return true
  }

  if (isManualEntrySubId(def.id)) {
    return false
  }

  if (
    noteKey === 'capitalAccount' &&
    def.id === 'opening-balance' &&
    (isNoteOpeningSubLocked(options.openingBalanceLocks, noteKey, def.id) ||
      isOpeningCapitalLinkedFromPriorYear(options.previousYearSubAmounts))
  ) {
    return true
  }

  if (
    isOpeningStockLinkedSub(noteKey, def.id) &&
    (isNoteOpeningSubLocked(options.openingBalanceLocks, noteKey, def.id) ||
      isOpeningStockLinkedFromPriorYear(options.previousYearSubAmounts))
  ) {
    return true
  }

  if (isClosingStockLinkedInventoriesSub(noteKey, def.id)) {
    return true
  }

  if (noteKey === 'revenueFromOperations' && def.id === 'gst-sales') {
    return true
  }

  return false
}

export function currentYearReadOnlyHint(
  noteKey: keyof FsNotes,
  subId: string,
  kind: NoteSubFieldDef['kind'],
): string | undefined {
  if (noteKey === 'capitalAccount' && subId === 'opening-balance') {
    return 'Auto: Opening capital from previous year closing (Capital A/c)'
  }
  if (noteKey === 'costOfGoodsSold' && subId === 'opening-stock') {
    return 'Auto: Opening stock from previous year closing stock (Note 21)'
  }
  if (isClosingStockLinkedInventoriesSub(noteKey, subId)) {
    return 'Auto: Closing stock from Note 21 (Cost of Goods Sold)'
  }
  if (noteKey === 'depreciationAmortization') {
    return 'Auto from Depreciation Schedule'
  }
  if (noteKey === 'financeCost' && kind === 'auto' && subId.startsWith('interest-')) {
    return 'Auto: Interest paid from Repayment Schedule'
  }
  if (
    (noteKey === 'longTermBorrowings' || noteKey === 'shortTermBorrowings') &&
    kind === 'auto' &&
    subId.startsWith('loan-')
  ) {
    return 'Auto: Closing balance from Loan Repayment Schedule'
  }
  if (
    noteKey === 'cashAtBank' &&
    kind === 'auto' &&
    subId.startsWith('bank-') &&
    !subId.startsWith('bank-st-')
  ) {
    return 'Auto: Credit balance from Bank Account tab (Current / Savings)'
  }
  if (noteKey === 'cashInHand' && subId === 'cash-flow-adjustment') {
    return 'Auto: Sources vs Application difference (Cash Flow Adjustment)'
  }
  if (
    noteKey === 'shortTermBorrowings' &&
    kind === 'auto' &&
    subId.startsWith('bank-st-')
  ) {
    return 'Auto: Debit balance from Bank Account tab (CC / OD)'
  }
  if (noteKey === 'revenueFromOperations' && subId === 'gst-sales') {
    return 'Auto: Taxable sales from GST Reco (Sales + Amended sales)'
  }
  return undefined
}
