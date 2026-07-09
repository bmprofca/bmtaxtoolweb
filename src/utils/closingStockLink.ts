import type { FsNotes, NoteSubAmounts } from '../types/fs'

export const CLOSING_STOCK_SOURCE_NOTE: keyof FsNotes = 'costOfGoodsSold'
export const CLOSING_STOCK_SOURCE_SUB = 'less-closing-stock'
export const OPENING_STOCK_SUB = 'opening-stock'
export const CLOSING_STOCK_TARGET_NOTE: keyof FsNotes = 'inventoriesTradeReceivables'
export const CLOSING_STOCK_TARGET_SUB = 'inventories'

export function isClosingStockLinkedInventoriesSub(noteKey: keyof FsNotes, subId: string) {
  return noteKey === CLOSING_STOCK_TARGET_NOTE && subId === CLOSING_STOCK_TARGET_SUB
}

export function isOpeningStockLinkedSub(noteKey: keyof FsNotes, subId: string) {
  return noteKey === CLOSING_STOCK_SOURCE_NOTE && subId === OPENING_STOCK_SUB
}

/** Prior-year Note 21 closing stock is available for the opening-stock link. */
export function isOpeningStockLinkedFromPriorYear(
  previousYearSubAmounts: NoteSubAmounts | null | undefined,
): boolean {
  return previousYearSubAmounts?.[CLOSING_STOCK_SOURCE_NOTE]?.[CLOSING_STOCK_SOURCE_SUB] !== undefined
}

export function priorYearClosingStockAmount(
  previousYearSubAmounts: NoteSubAmounts | null | undefined,
): number {
  return previousYearSubAmounts?.[CLOSING_STOCK_SOURCE_NOTE]?.[CLOSING_STOCK_SOURCE_SUB]?.current ?? 0
}

/** Note 21 opening stock mirrors prior-year Note 21 closing stock. */
export function applyOpeningStockLink(
  noteSubAmounts: NoteSubAmounts,
  previousYearSubAmounts: NoteSubAmounts | null | undefined,
): NoteSubAmounts {
  if (!isOpeningStockLinkedFromPriorYear(previousYearSubAmounts)) {
    return noteSubAmounts
  }

  const openingAmount = priorYearClosingStockAmount(previousYearSubAmounts)
  const existing = noteSubAmounts[CLOSING_STOCK_SOURCE_NOTE]?.[OPENING_STOCK_SUB] ?? {
    current: 0,
    previous: 0,
  }

  if (existing.current === openingAmount) {
    return noteSubAmounts
  }

  return {
    ...noteSubAmounts,
    [CLOSING_STOCK_SOURCE_NOTE]: {
      ...noteSubAmounts[CLOSING_STOCK_SOURCE_NOTE],
      [OPENING_STOCK_SUB]: {
        ...existing,
        current: openingAmount,
      },
    },
  }
}

/** Note 14 Inventories always mirrors Note 21 Less: Closing Stock. */
export function applyClosingStockLink(noteSubAmounts: NoteSubAmounts): NoteSubAmounts {
  const closing = noteSubAmounts[CLOSING_STOCK_SOURCE_NOTE]?.[CLOSING_STOCK_SOURCE_SUB] ?? {
    current: 0,
    previous: 0,
  }

  const existing = noteSubAmounts[CLOSING_STOCK_TARGET_NOTE]?.[CLOSING_STOCK_TARGET_SUB] ?? {
    current: 0,
    previous: 0,
  }

  if (
    existing.current === closing.current &&
    existing.previous === closing.previous
  ) {
    return noteSubAmounts
  }

  return {
    ...noteSubAmounts,
    [CLOSING_STOCK_TARGET_NOTE]: {
      ...noteSubAmounts[CLOSING_STOCK_TARGET_NOTE],
      [CLOSING_STOCK_TARGET_SUB]: {
        current: closing.current,
        previous: closing.previous,
      },
    },
  }
}
