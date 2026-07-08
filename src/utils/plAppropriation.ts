import type { NoteSubCell, NoteValue, PlAppropriationLine } from '../types/fs'
import {
  normalizePlAppropriationCategoryId,
  plAppropriationSubId,
} from './plAppropriationCategories'

const emptyCell = (): NoteSubCell => ({ current: 0, previous: 0 })

function generateLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function sumPlAppropriation(
  lines: PlAppropriationLine[],
  amounts: Record<string, NoteSubCell>,
  previousYearAmounts?: Record<string, NoteSubCell> | null,
): NoteValue {
  let current = 0
  let previous = 0

  for (const line of lines) {
    const subId = plAppropriationSubId(line.id)
    const stored = amounts[subId] ?? emptyCell()
    current += stored.current
    previous += previousYearAmounts?.[subId]?.current ?? stored.previous
  }

  return { current, previous }
}

export function calcBalanceProfit(netProfit: NoteValue, appropriationTotal: NoteValue): NoteValue {
  return {
    current: netProfit.current - appropriationTotal.current,
    previous: netProfit.previous - appropriationTotal.previous,
  }
}

export function normalizePlAppropriationLines(
  raw: PlAppropriationLine[] | undefined,
): PlAppropriationLine[] {
  if (!raw?.length) {
    return []
  }

  return raw.map((line) => ({
    id: line.id,
    categoryId: normalizePlAppropriationCategoryId(line.categoryId),
  }))
}

export function migratePlAppropriationAmounts(
  lines: PlAppropriationLine[],
  amounts: Record<string, NoteSubCell>,
): Record<string, NoteSubCell> {
  const result = { ...amounts }

  for (const line of lines) {
    const subId = plAppropriationSubId(line.id)
    if (!result[subId]) {
      result[subId] = emptyCell()
    }
  }

  return result
}

export function createPlAppropriationLine(
  categoryId = 'others',
): { line: PlAppropriationLine; subId: string; amount: NoteSubCell } {
  const lineId = generateLineId()
  const subId = plAppropriationSubId(lineId)
  return {
    line: { id: lineId, categoryId: normalizePlAppropriationCategoryId(categoryId) },
    subId,
    amount: emptyCell(),
  }
}
