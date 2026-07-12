import type { LedgerRecord } from '../types/ledger'
import type {
  AdministrativeExpenseLine,
  CashAdjustment,
  FinancialStatementData,
  FsNotes,
  NoteSubAmounts,
  NoteValue,
} from '../types/fs'
import { adminExpenseSubId } from './adminExpenseCategories'
import { createLedger, invalidateLedgersCache } from '../api/ledger'
import { getLedgersForGroup, resolveAdminExpenseCategoryId } from './ledgerUtils'
import type { ResolvedSubRow } from './noteSubFields'

export const ROUND_OFF_ADJUSTMENT_LEDGER_NAME = 'Round Off Adjustment'
export const ROUND_OFF_ADJUSTMENT_LEDGER_ID = 'round-off-adjustment'

const ROUND_OFF_TOLERANCE = 0.004

let adminLineIdCounter = 0

function generateAdminLineId() {
  adminLineIdCounter += 1
  return `ro${adminLineIdCounter.toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function n(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundToPaisa(value: number) {
  return Math.round(value * 100) / 100
}

/** Positive fractional part removed when flooring cash to whole rupees. */
export function positiveFractionalPart(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return roundToPaisa(value - Math.floor(value))
}

export function computeCashRoundOffAmounts(bank: NoteValue, hand: NoteValue): NoteValue {
  return {
    current: roundToPaisa(
      positiveFractionalPart(bank.current) + positiveFractionalPart(hand.current),
    ),
    previous: roundToPaisa(
      positiveFractionalPart(bank.previous) + positiveFractionalPart(hand.previous),
    ),
  }
}

export function findRoundOffLedger(ledgers: LedgerRecord[]) {
  const target = ROUND_OFF_ADJUSTMENT_LEDGER_NAME.trim().toLowerCase()
  return getLedgersForGroup(ledgers, 'otherAdministrativeExpenses').find(
    (ledger) => ledger.name.trim().toLowerCase() === target,
  )
}

export function findRoundOffAdminLine(
  lines: AdministrativeExpenseLine[] | undefined,
  ledgers: LedgerRecord[],
) {
  const roundOffLedger = findRoundOffLedger(ledgers)
  if (!roundOffLedger) {
    return undefined
  }
  return (lines ?? []).find(
    (line) => resolveAdminExpenseCategoryId(ledgers, line.categoryId) === roundOffLedger.id,
  )
}

export function getRoundOffAdminSubAmount(
  administrativeExpenseLines: AdministrativeExpenseLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
  ledgers: LedgerRecord[],
): NoteValue {
  const line = findRoundOffAdminLine(administrativeExpenseLines, ledgers)
  if (!line) {
    return { current: 0, previous: 0 }
  }
  const sub = noteSubAmounts?.otherAdministrativeExpenses?.[adminExpenseSubId(line.id)]
  return {
    current: n(sub?.current),
    previous: n(sub?.previous),
  }
}

export function hasActiveCashRoundOff(
  administrativeExpenseLines: AdministrativeExpenseLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
  ledgers: LedgerRecord[],
) {
  const amount = getRoundOffAdminSubAmount(administrativeExpenseLines, noteSubAmounts, ledgers)
  return amount.current > ROUND_OFF_TOLERANCE || amount.previous > ROUND_OFF_TOLERANCE
}

export function floorCashNoteValue(value: NoteValue): NoteValue {
  return {
    current: Math.floor(n(value.current)),
    previous: Math.floor(n(value.previous)),
  }
}

export function applyIntegerCashNotes(
  notes: FsNotes,
  administrativeExpenseLines: AdministrativeExpenseLine[] | undefined,
  noteSubAmounts: NoteSubAmounts | undefined,
  ledgers: LedgerRecord[],
): FsNotes {
  if (!hasActiveCashRoundOff(administrativeExpenseLines, noteSubAmounts, ledgers)) {
    return notes
  }
  return {
    ...notes,
    cashAtBank: floorCashNoteValue(notes.cashAtBank),
    cashInHand: floorCashNoteValue(notes.cashInHand),
  }
}

export function getUnroundedCashTotalsFromSubRows(
  noteSubRowsMap: Record<keyof FsNotes, ResolvedSubRow[]>,
): { bank: NoteValue; hand: NoteValue } {
  const bankRows = noteSubRowsMap.cashAtBank ?? []
  const handRows = noteSubRowsMap.cashInHand ?? []

  const bankFromAccounts = bankRows
    .filter((row) => row.id.startsWith('bank-'))
    .reduce(
      (acc, row) => ({
        current: acc.current + n(row.current),
        previous: acc.previous + n(row.previous),
      }),
      { current: 0, previous: 0 },
    )

  const bankEntry = bankRows.find((row) => row.id === 'cash-at-bank')
  const bankTotalRow = bankRows.find((row) => row.kind === 'total')
  const bank =
    bankFromAccounts.current > 0 ||
    bankFromAccounts.previous > 0 ||
    (bankEntry && (n(bankEntry.current) !== 0 || n(bankEntry.previous) !== 0))
      ? bankFromAccounts.current > 0 || bankFromAccounts.previous > 0
        ? bankFromAccounts
        : {
            current: n(bankEntry?.current),
            previous: n(bankEntry?.previous),
          }
      : {
          current: n(bankTotalRow?.current),
          previous: n(bankTotalRow?.previous),
        }

  const handEntry = handRows.find((row) => row.id === 'cash-in-hand')
  const handAdj = handRows.find((row) => row.id === 'cash-flow-adjustment')
  const hand = {
    current: n(handEntry?.current) + n(handAdj?.current),
    previous: n(handEntry?.previous) + n(handAdj?.previous),
  }

  return { bank, hand }
}

export function needsCashRoundOff(bank: NoteValue, hand: NoteValue) {
  const roundOff = computeCashRoundOffAmounts(bank, hand)
  return roundOff.current > ROUND_OFF_TOLERANCE || roundOff.previous > ROUND_OFF_TOLERANCE
}

function normalizeCashAdjustment(value?: Partial<CashAdjustment> | null): CashAdjustment {
  return {
    current: n(value?.current),
    previous: n(value?.previous),
  }
}

function roundOffAmountsMatch(left: NoteValue, right: NoteValue) {
  return (
    Math.abs(left.current - right.current) <= ROUND_OFF_TOLERANCE &&
    Math.abs(left.previous - right.previous) <= ROUND_OFF_TOLERANCE
  )
}

function cashAdjustmentMatches(left: CashAdjustment, right: CashAdjustment) {
  return (
    Math.abs(left.current - right.current) <= ROUND_OFF_TOLERANCE &&
    Math.abs(left.previous - right.previous) <= ROUND_OFF_TOLERANCE
  )
}

export function applyCashRoundOffToFsData(
  fsData: FinancialStatementData,
  ledgers: LedgerRecord[],
  rawCash: { bank: NoteValue; hand: NoteValue },
): FinancialStatementData {
  const roundOff = computeCashRoundOffAmounts(rawCash.bank, rawCash.hand)
  const handFrac = {
    current: positiveFractionalPart(rawCash.hand.current),
    previous: positiveFractionalPart(rawCash.hand.previous),
  }
  const cashAdj = normalizeCashAdjustment(fsData.cashAdjustment)
  const nextCashAdj = {
    current: roundToPaisa(cashAdj.current - handFrac.current),
    previous: roundToPaisa(cashAdj.previous - handFrac.previous),
  }

  const roundOffLedger = findRoundOffLedger(ledgers)
  const ledgerId = roundOffLedger?.id ?? ROUND_OFF_ADJUSTMENT_LEDGER_ID

  let lines = [...(fsData.administrativeExpenseLines ?? [])]
  let line = findRoundOffAdminLine(lines, ledgers)

  if (
    !line &&
    (roundOff.current > ROUND_OFF_TOLERANCE || roundOff.previous > ROUND_OFF_TOLERANCE)
  ) {
    line = { id: generateAdminLineId(), categoryId: ledgerId }
    lines = [...lines, line]
  }

  const adminSubs = { ...(fsData.noteSubAmounts.otherAdministrativeExpenses ?? {}) }

  if (line) {
    const subId = adminExpenseSubId(line.id)
    if (roundOff.current <= ROUND_OFF_TOLERANCE && roundOff.previous <= ROUND_OFF_TOLERANCE) {
      adminSubs[subId] = { current: 0, previous: 0 }
    } else {
      adminSubs[subId] = {
        current: roundOff.current,
        previous: roundOff.previous,
      }
    }
  }

  return {
    ...fsData,
    administrativeExpenseLines: lines,
    noteSubAmounts: {
      ...fsData.noteSubAmounts,
      otherAdministrativeExpenses: adminSubs,
    },
    cashAdjustment: nextCashAdj,
  }
}

export function isCashRoundOffSynced(
  fsData: FinancialStatementData,
  ledgers: LedgerRecord[],
  rawCash: { bank: NoteValue; hand: NoteValue },
) {
  const expected = applyCashRoundOffToFsData(fsData, ledgers, rawCash)
  const expectedRoundOff = getRoundOffAdminSubAmount(
    expected.administrativeExpenseLines,
    expected.noteSubAmounts,
    ledgers,
  )
  const actualRoundOff = getRoundOffAdminSubAmount(
    fsData.administrativeExpenseLines,
    fsData.noteSubAmounts,
    ledgers,
  )

  if (!roundOffAmountsMatch(expectedRoundOff, actualRoundOff)) {
    return false
  }

  return cashAdjustmentMatches(
    normalizeCashAdjustment(fsData.cashAdjustment),
    normalizeCashAdjustment(expected.cashAdjustment),
  )
}

export function clearCashRoundOffFromFsData(fsData: FinancialStatementData, ledgers: LedgerRecord[]) {
  const line = findRoundOffAdminLine(fsData.administrativeExpenseLines, ledgers)
  if (!line) {
    return fsData
  }

  const adminSubs = { ...(fsData.noteSubAmounts.otherAdministrativeExpenses ?? {}) }
  adminSubs[adminExpenseSubId(line.id)] = { current: 0, previous: 0 }

  return {
    ...fsData,
    noteSubAmounts: {
      ...fsData.noteSubAmounts,
      otherAdministrativeExpenses: adminSubs,
    },
    cashAdjustment: normalizeCashAdjustment(fsData.cashAdjustment),
  }
}

export async function ensureRoundOffAdjustmentLedger(): Promise<LedgerRecord> {
  const { ledger } = await createLedger({
    id: ROUND_OFF_ADJUSTMENT_LEDGER_ID,
    name: ROUND_OFF_ADJUSTMENT_LEDGER_NAME,
    group: 'otherAdministrativeExpenses',
  })
  invalidateLedgersCache()
  return ledger
}
