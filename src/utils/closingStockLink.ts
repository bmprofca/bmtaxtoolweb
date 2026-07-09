import type { FsNotes, NoteSubAmounts } from '../types/fs'

export const CLOSING_STOCK_SOURCE_NOTE: keyof FsNotes = 'costOfGoodsSold'
export const CLOSING_STOCK_SOURCE_SUB = 'less-closing-stock'
export const CLOSING_STOCK_TARGET_NOTE: keyof FsNotes = 'inventoriesTradeReceivables'
export const CLOSING_STOCK_TARGET_SUB = 'inventories'

export function isClosingStockLinkedInventoriesSub(noteKey: keyof FsNotes, subId: string) {
  return noteKey === CLOSING_STOCK_TARGET_NOTE && subId === CLOSING_STOCK_TARGET_SUB
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
