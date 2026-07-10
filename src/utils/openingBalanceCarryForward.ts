import type { BankAccountRecord } from '../types/bankAccount'
import { isBankAccountActive } from './bankAccount'
import type {
  AdministrativeExpenseLine,
  DepreciationRow,
  FinancialStatementData,
  FsNotes,
  ManualNoteLine,
  NoteSubAmounts,
  PreviousYearDepreciationSummary,
  AssetDepreciationHistoryRow,
} from '../types/fs'
import type { LoanRecord } from '../types/loan'
import { manualNoteLineSubId } from './manualNoteLineConfig'
import type { LedgerRecord } from '../types/ledger'
import type { FinancialYear } from '../types'
import { recalcDepreciationRow, sumDepreciationSchedule, getDepreciationClosingWdv, isPlaceholderDepreciationRow, resolveEffectiveClosingWdv } from './depreciation'
import { expandPriorScheduleWithHistory, sumDepreciationHistoryForFy } from './depreciationLedgerSync'
import { NOTE_FIELDS, notesWithPreviousFromPriorFy } from './fsDefaults'
import { defaultClosingAdjustmentFields, recomputeLoansForFy } from './loanCalculator'
import { buildEffectiveNotes } from './noteCalculator'
import { sumPlAppropriation } from './plAppropriation'
import {
  buildSubResolveContext,
  resolveNoteSubRows,
  type ResolvedSubRow,
} from './noteSubFields'
import { computeStatements } from './fsCalculator'

export const NOTE_OPENING_CARRY_RULES: Array<{
  targetNoteKey: keyof FsNotes
  targetSubId: string
  sourceNoteKey: keyof FsNotes
  sourceSubId: string
}> = [
  {
    targetNoteKey: 'capitalAccount',
    targetSubId: 'opening-balance',
    sourceNoteKey: 'capitalAccount',
    sourceSubId: 'capital-closing',
  },
  {
    targetNoteKey: 'costOfGoodsSold',
    targetSubId: 'opening-stock',
    sourceNoteKey: 'costOfGoodsSold',
    sourceSubId: 'less-closing-stock',
  },
]

let balanceSheetNoteKeysCache: Set<keyof FsNotes> | null = null

function getBalanceSheetNoteKeys(): Set<keyof FsNotes> {
  if (!balanceSheetNoteKeysCache) {
    balanceSheetNoteKeysCache = new Set(
      NOTE_FIELDS.filter((field) => {
        const noteNo = Number.parseInt(field.noteNo, 10)
        return Number.isFinite(noteNo) && noteNo >= 1 && noteNo <= 18
      }).map((field) => field.key),
    )
  }
  return balanceSheetNoteKeysCache
}

function generateRowId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export interface OpeningBalanceLocks {
  noteSubs: Set<string>
  loanIds: Set<string>
  bankIds: Set<string>
  depRowIds: Set<string>
  /** Prior-year admin expense lines — category is fixed; current-year amount stays editable. */
  adminExpenseLineIds: Set<string>
  /** Prior-year manual note lines — category is fixed; current-year amount stays editable. */
  manualNoteLineIds: Set<string>
  previousYearDepOpening: boolean
  /** Previous year depreciation row is fully linked from prior FY schedule totals. */
  previousYearDepLinked: boolean
}

export interface PriorClosingSnapshot {
  noteSubs: Partial<Record<keyof FsNotes, Record<string, number>>>
  loanClosings: Map<string, number>
  bankClosings: Map<string, number>
  depClosingsById: Map<string, number>
  depClosingsByLedgerId: Map<string, number>
  depClosingsByName: Map<string, number>
  depTotalClosingWdv: number
}

function noteSubLockKey(noteKey: keyof FsNotes, subId: string) {
  return `${noteKey}.${subId}`
}

export function isNoteOpeningSubLocked(
  locks: OpeningBalanceLocks | null | undefined,
  noteKey: keyof FsNotes,
  subId: string,
): boolean {
  return locks?.noteSubs.has(noteSubLockKey(noteKey, subId)) ?? false
}

export function isAdminExpenseLineCategoryLocked(
  locks: OpeningBalanceLocks | null | undefined,
  lineId: string,
): boolean {
  return locks?.adminExpenseLineIds.has(lineId) ?? false
}

function manualNoteLineLockKey(noteKey: keyof FsNotes, lineId: string) {
  return `${noteKey}.${lineId}`
}

export function isManualNoteLineCategoryLocked(
  locks: OpeningBalanceLocks | null | undefined,
  noteKey: keyof FsNotes,
  lineId: string,
): boolean {
  return locks?.manualNoteLineIds.has(manualNoteLineLockKey(noteKey, lineId)) ?? false
}

const ALLOWED_NOTE_SUB_LOCKS = new Set([
  noteSubLockKey('capitalAccount', 'opening-balance'),
  noteSubLockKey('costOfGoodsSold', 'opening-stock'),
])

export function sanitizeNoteSubLocks(locks: OpeningBalanceLocks) {
  locks.noteSubs = new Set(
    [...locks.noteSubs].filter((key) => ALLOWED_NOTE_SUB_LOCKS.has(key)),
  )
}

export function isOpeningSubField(noteKey: keyof FsNotes, subId: string): boolean {
  return NOTE_OPENING_CARRY_RULES.some(
    (rule) => rule.targetNoteKey === noteKey && rule.targetSubId === subId,
  )
}

export function canCarryForwardFromPriorYear(
  business: { startingYear: number },
  priorFy: FinancialYear,
): boolean {
  return business.startingYear <= priorFy.endYear
}

function collectResolvedSubs(rows: ResolvedSubRow[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const row of rows) {
    if (row.kind === 'header') {
      continue
    }
    result[row.id] = row.current
  }
  return result
}

export function buildPriorYearClosingSnapshot(params: {
  fs: FinancialStatementData
  fyStartYear: number
  fyEndYear: number
  previousYearSubAmounts: NoteSubAmounts | null
  previousYearNotes: FsNotes | null
  previousYearLoans: LoanRecord[] | null
  previousYearBankAccounts: BankAccountRecord[]
  previousYearPlAppropriationAmounts: Record<string, { current: number; previous: number }> | null
  ledgers: LedgerRecord[]
}): PriorClosingSnapshot {
  const {
    fs,
    fyStartYear,
    fyEndYear,
    previousYearSubAmounts,
    previousYearNotes,
    previousYearLoans,
    previousYearBankAccounts,
    previousYearPlAppropriationAmounts,
    ledgers,
  } = params

  const computedLoans = recomputeLoansForFy(fs.loans, fyStartYear, fyEndYear)
  const loanCalcPayload = computedLoans.map((loan) => ({
    id: loan.id,
    closingBalance: loan.closingBalance,
    interestForYear: loan.interestForYear,
    lender: loan.lender,
  }))
  const previousYearComputedLoans =
    previousYearLoans && previousYearLoans.length > 0
      ? recomputeLoansForFy(previousYearLoans, fyStartYear - 1, fyEndYear - 1).map((loan) => ({
          id: loan.id,
          closingBalance: loan.closingBalance,
          interestForYear: loan.interestForYear,
          lender: loan.lender,
        }))
      : []

  const plAppropriationTotal = sumPlAppropriation(
    fs.plAppropriationLines ?? [],
    fs.plAppropriationAmounts ?? {},
    previousYearPlAppropriationAmounts,
  )

  const mergedNotes = notesWithPreviousFromPriorFy(fs.notes, previousYearNotes)
  const noteCalcContext = {
    notes: mergedNotes,
    noteBreakdowns: fs.noteBreakdowns,
    noteSubAmounts: fs.noteSubAmounts,
    previousYearSubAmounts,
    depreciationSchedule: fs.depreciationSchedule,
    previousYearDepreciation: fs.previousYearDepreciation,
    loans: fs.loans,
    previousYearNotes,
    fyStartYear,
    fyEndYear,
    computedLoans: loanCalcPayload,
    previousYearComputedLoans,
    administrativeExpenseLines: fs.administrativeExpenseLines ?? [],
    otherShortTermBorrowingLines: fs.otherShortTermBorrowingLines ?? [],
    manualNoteLines: fs.manualNoteLines ?? [],
    capitalAccountLines: fs.capitalAccountLines ?? [],
    ledgers,
    plAppropriationTotal,
    bankAccounts: fs.bankAccounts,
    previousYearBankAccounts,
    cashAdjustment: {
      current: Number(fs.cashAdjustment?.current) || 0,
      previous: Number(fs.cashAdjustment?.previous) || 0,
    },
  }

  const effectiveNotes = buildEffectiveNotes(noteCalcContext)
  const computed = computeStatements(
    effectiveNotes,
    fs.depreciationSchedule,
    fs.loans,
    fyStartYear,
    fyEndYear,
    fs.previousYearDepreciation,
    plAppropriationTotal,
  )

  const subResolveContext = buildSubResolveContext(
    fs.noteSubAmounts,
    previousYearSubAmounts,
    computed,
    fs.depreciationSchedule,
    fs.previousYearDepreciation,
    fs.loans,
    loanCalcPayload,
    fs.administrativeExpenseLines ?? [],
    previousYearComputedLoans,
    fs.otherShortTermBorrowingLines ?? [],
    fs.manualNoteLines ?? [],
    plAppropriationTotal,
    fs.bankAccounts,
    previousYearBankAccounts,
    fs.capitalAccountLines ?? [],
    ledgers,
    null,
    {
      current: Number(fs.cashAdjustment?.current) || 0,
      previous: Number(fs.cashAdjustment?.previous) || 0,
    },
  )

  const noteSubs: Partial<Record<keyof FsNotes, Record<string, number>>> = {}
  for (const noteKey of Object.keys(fs.notes) as (keyof FsNotes)[]) {
    const rows = resolveNoteSubRows(noteKey, subResolveContext)
    noteSubs[noteKey] = collectResolvedSubs(rows)
  }

  const loanClosings = new Map<string, number>()
  for (const loan of computedLoans) {
    loanClosings.set(loan.id, loan.closingBalance)
  }

  const bankClosings = new Map<string, number>()
  for (const account of fs.bankAccounts) {
    bankClosings.set(account.id, account.closingBalance)
  }

  const depClosingsById = new Map<string, number>()
  const depClosingsByLedgerId = new Map<string, number>()
  const depClosingsByName = new Map<string, number>()
  for (const row of fs.depreciationSchedule) {
    const closing = getDepreciationClosingWdv(row)
    depClosingsById.set(row.id, closing)
    if (row.ledgerId) {
      depClosingsByLedgerId.set(row.ledgerId, closing)
    }
    const name = row.assetName.trim().toLowerCase()
    if (name) {
      depClosingsByName.set(name, closing)
    }
  }

  const depTotalClosingWdv = sumDepreciationSchedule(fs.depreciationSchedule).closingWdv

  return {
    noteSubs,
    loanClosings,
    bankClosings,
    depClosingsById,
    depClosingsByLedgerId,
    depClosingsByName,
    depTotalClosingWdv,
  }
}

function hasMeaningfulPriorYearData(
  priorFs: FinancialStatementData,
  priorClosing: PriorClosingSnapshot,
): boolean {
  if (priorFs.loans.length > 0) {
    return true
  }

  if (
    priorFs.bankAccounts.some(
      (account) =>
        isBankAccountActive(account) ||
        account.closingBalance !== 0 ||
        account.openingBalance !== 0,
    )
  ) {
    return true
  }

  if (
    priorFs.depreciationSchedule.some((row) => {
      const calc = recalcDepreciationRow(row)
      return calc.closingWdv !== 0 || calc.openingWdv !== 0 || row.assetName.trim() !== ''
    })
  ) {
    return true
  }

  for (const rule of NOTE_OPENING_CARRY_RULES) {
    const value = priorClosing.noteSubs[rule.sourceNoteKey]?.[rule.sourceSubId] ?? 0
    if (value !== 0) {
      return true
    }
  }

  for (const noteKey of getBalanceSheetNoteKeys()) {
    const subs = priorClosing.noteSubs[noteKey as keyof FsNotes]
    if (!subs) {
      continue
    }
    if (Object.values(subs).some((value) => value !== 0)) {
      return true
    }
  }

  return Object.values(priorFs.notes).some((note) => note.current !== 0 || note.previous !== 0)
}

function applyNoteOpeningCarryForward(
  noteSubAmounts: NoteSubAmounts,
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
): NoteSubAmounts {
  let next: NoteSubAmounts = { ...noteSubAmounts }

  for (const rule of NOTE_OPENING_CARRY_RULES) {
    const amount = priorClosing.noteSubs[rule.sourceNoteKey]?.[rule.sourceSubId]
    if (amount === undefined) {
      continue
    }
    if (amount === 0) {
      if (rule.targetSubId === 'opening-stock') {
        continue
      }
      if (rule.targetSubId !== 'opening-balance') {
        continue
      }
    }

    const existing = next[rule.targetNoteKey]?.[rule.targetSubId] ?? { current: 0, previous: 0 }

    next[rule.targetNoteKey] = {
      ...next[rule.targetNoteKey],
      [rule.targetSubId]: {
        ...existing,
        current: amount,
      },
    }

    if (rule.targetSubId === 'opening-balance' || rule.targetSubId === 'opening-stock') {
      locks.noteSubs.add(noteSubLockKey(rule.targetNoteKey, rule.targetSubId))
    }
  }

  return next
}

function copyLinesIfEmpty<T extends { id: string }>(current: T[], prior: T[]): T[] {
  if (current.length > 0 || prior.length === 0) {
    return current
  }
  return prior.map((line) => ({ ...line }))
}

function carryAdministrativeExpenseLines(
  lines: AdministrativeExpenseLine[],
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
) {
  for (const line of lines) {
    const subId = `admin-line-${line.id}`
    const amount = priorClosing.noteSubs.otherAdministrativeExpenses?.[subId]
    if (amount !== undefined && amount !== 0) {
      locks.adminExpenseLineIds.add(line.id)
    }
  }
}

function carryManualNoteLines(
  lines: ManualNoteLine[],
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
) {
  for (const line of lines) {
    const noteKey = line.noteKey as keyof FsNotes
    const subId = manualNoteLineSubId(line.id)
    const amount = priorClosing.noteSubs[noteKey]?.[subId]
    if (amount !== undefined) {
      locks.manualNoteLineIds.add(manualNoteLineLockKey(noteKey, line.id))
    }
  }
}

const NON_RESETTABLE_SUB_IDS = new Set([
  'opening-balance',
  'opening-stock',
  'inventories',
  'capital-closing',
  'cash-flow-adjustment',
  'gross-book-value',
  'less-depreciation',
  'net-book-value',
  'gross-profit',
  'gross-profit-pct',
  'total-cogs',
  'cash-at-bank',
])

function shouldResetAutoCarriedCurrentSub(subId: string) {
  if (NON_RESETTABLE_SUB_IDS.has(subId) || subId.endsWith('-total')) {
    return false
  }

  return !/^(loan-|bank-|bank-st-|interest-|interest-manual-st-)/.test(subId)
}

function resetAutoCarriedManualEntryAmounts(
  noteSubAmounts: NoteSubAmounts,
  priorClosing: PriorClosingSnapshot,
): NoteSubAmounts {
  let next: NoteSubAmounts = { ...noteSubAmounts }

  for (const [noteKey, subs] of Object.entries(priorClosing.noteSubs) as Array<
    [keyof FsNotes, Record<string, number>]
  >) {
    for (const [subId, priorAmount] of Object.entries(subs)) {
      if (!shouldResetAutoCarriedCurrentSub(subId)) {
        continue
      }

      const existing = next[noteKey]?.[subId]
      if (!existing || existing.current !== priorAmount) {
        continue
      }

      next[noteKey] = {
        ...next[noteKey],
        [subId]: { current: 0, previous: 0 },
      }
    }
  }

  return next
}

function carryForwardExistingLoan(
  loan: LoanRecord,
  priorClosingBalance: number,
): { loan: LoanRecord; changed: boolean } {
  const openingChanged = loan.openingBalance !== priorClosingBalance
  if (!openingChanged) {
    return { loan, changed: false }
  }

  return {
    loan: {
      ...loan,
      openingBalance: priorClosingBalance,
      ...defaultClosingAdjustmentFields(),
    },
    changed: true,
  }
}

function carryForwardNewLoanFromPrior(
  priorLoan: LoanRecord,
  priorClosingBalance: number,
): LoanRecord {
  return {
    ...priorLoan,
    openingBalance: priorClosingBalance,
    disbursement: 0,
    disbursementDate: '',
    prepaymentAmount: 0,
    prepaymentDate: '',
    ...defaultClosingAdjustmentFields(),
  }
}

function carryForwardLoans(
  loans: LoanRecord[],
  priorLoans: LoanRecord[],
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
): { loans: LoanRecord[]; changed: boolean } {
  const priorById = new Map(priorLoans.map((loan) => [loan.id, loan]))
  let changed = false

  const next = loans.map((loan) => {
    const priorClosingBalance = priorClosing.loanClosings.get(loan.id)
    if (priorClosingBalance === undefined) {
      return loan
    }

    const carried = carryForwardExistingLoan(loan, priorClosingBalance)
    if (carried.changed) {
      changed = true
    }

    locks.loanIds.add(loan.id)
    return carried.loan
  })

  const existingIds = new Set(next.map((loan) => loan.id))
  for (const [loanId, priorClosingBalance] of priorClosing.loanClosings) {
    if (existingIds.has(loanId)) {
      continue
    }

    const priorLoan = priorById.get(loanId)
    if (!priorLoan) {
      continue
    }

    locks.loanIds.add(loanId)
    next.push(carryForwardNewLoanFromPrior(priorLoan, priorClosingBalance))
    changed = true
  }

  return { loans: next, changed }
}

function carryForwardBankAccounts(
  bankAccounts: BankAccountRecord[],
  priorBankAccounts: BankAccountRecord[],
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
): BankAccountRecord[] {
  const priorById = new Map(priorBankAccounts.map((account) => [account.id, account]))
  const next = bankAccounts.map((account) => {
    const priorClosingBalance = priorClosing.bankClosings.get(account.id)
    if (priorClosingBalance === undefined) {
      return account
    }

    locks.bankIds.add(account.id)
    return { ...account, openingBalance: priorClosingBalance }
  })

  const existingIds = new Set(next.map((account) => account.id))
  for (const [accountId, priorClosingBalance] of priorClosing.bankClosings) {
    if (existingIds.has(accountId)) {
      continue
    }

    const priorAccount = priorById.get(accountId)
    if (!priorAccount || !isBankAccountActive(priorAccount)) {
      continue
    }

    locks.bankIds.add(accountId)
    next.push({
      ...priorAccount,
      status: 'active',
      closedInFyId: undefined,
      openingBalance: priorClosingBalance,
      debit: 0,
      credit: 0,
      bankCharge: 0,
      interest: 0,
      closingBalance: priorClosingBalance,
    })
  }

  return next
}

function resolvePriorDepClosing(
  row: DepreciationRow,
  priorClosing: PriorClosingSnapshot,
): number | undefined {
  if (row.ledgerId) {
    const byLedger = priorClosing.depClosingsByLedgerId.get(row.ledgerId)
    if (byLedger !== undefined) {
      return byLedger
    }
  }

  const byId = priorClosing.depClosingsById.get(row.id)
  if (byId !== undefined) {
    return byId
  }

  const name = row.assetName.trim().toLowerCase()
  if (name) {
    return priorClosing.depClosingsByName.get(name)
  }

  return undefined
}

function matchesPriorAssetRow(row: DepreciationRow, priorRow: DepreciationRow) {
  if (priorRow.ledgerId && row.ledgerId === priorRow.ledgerId) {
    return true
  }
  if (row.id === priorRow.id) {
    return true
  }
  const priorName = priorRow.assetName.trim().toLowerCase()
  const rowName = row.assetName.trim().toLowerCase()
  return Boolean(priorName && rowName && priorName === rowName)
}

function createCarriedDepreciationRow(priorRow: DepreciationRow, openingWdv: number, rowId: string) {
  return recalcDepreciationRow({
    ...priorRow,
    id: rowId,
    openingWdv,
    additionBeforeOct3: 0,
    additionOnAfterOct3: 0,
    assetDeletion: 0,
  })
}

function carryForwardDepreciation(
  schedule: DepreciationRow[],
  priorSchedule: DepreciationRow[],
  priorClosing: PriorClosingSnapshot,
  locks: OpeningBalanceLocks,
): DepreciationRow[] {
  const activePriorRows = priorSchedule.filter((row) => getDepreciationClosingWdv(row) > 0)
  const meaningfulCurrent = schedule.filter((row) => !isPlaceholderDepreciationRow(row))

  const next: DepreciationRow[] = []
  const usedPriorRowIds = new Set<string>()
  const usedLedgerIds = new Set<string>()
  const usedRowIds = new Set<string>()

  const resolveUniqueRowId = (preferredId: string) => {
    const trimmed = preferredId.trim()
    if (trimmed && !usedRowIds.has(trimmed)) {
      usedRowIds.add(trimmed)
      return trimmed
    }

    let rowId = generateRowId()
    while (usedRowIds.has(rowId)) {
      rowId = generateRowId()
    }
    usedRowIds.add(rowId)
    return rowId
  }

  for (const row of meaningfulCurrent) {
    const matchedPrior = activePriorRows.find((priorRow) => matchesPriorAssetRow(row, priorRow))
    if (matchedPrior) {
      usedPriorRowIds.add(matchedPrior.id)
      if (matchedPrior.ledgerId) {
        usedLedgerIds.add(matchedPrior.ledgerId)
      }

      const matchedClosing = getDepreciationClosingWdv(matchedPrior)
      if (matchedClosing <= 0) {
        continue
      }

      locks.depRowIds.add(row.id)
      next.push(
        createCarriedDepreciationRow(
          row,
          row.openingWdv !== 0 ? row.openingWdv : matchedClosing,
          resolveUniqueRowId(row.id),
        ),
      )
      if (row.ledgerId) {
        usedLedgerIds.add(row.ledgerId)
      }
      continue
    }

    const priorWdv = resolvePriorDepClosing(row, priorClosing)

    if (priorWdv !== undefined && priorWdv > 0) {
      locks.depRowIds.add(row.id)
      next.push(
        createCarriedDepreciationRow(
          row,
          row.openingWdv !== 0 ? row.openingWdv : priorWdv,
          resolveUniqueRowId(row.id),
        ),
      )
      if (row.ledgerId) {
        usedLedgerIds.add(row.ledgerId)
      }
      continue
    }

    if (priorWdv !== undefined && priorWdv <= 0) {
      continue
    }

    const carried = recalcDepreciationRow({ ...row, id: resolveUniqueRowId(row.id) })
    const hasCurrentYearActivity =
      carried.openingWdv > 0 ||
      carried.additionBeforeOct3 > 0 ||
      carried.additionOnAfterOct3 > 0 ||
      carried.assetDeletion > 0 ||
      carried.closingWdv > 0

    if (hasCurrentYearActivity || (priorWdv === undefined && (row.ledgerId || row.assetName.trim()))) {
      next.push(carried)
      if (row.ledgerId) {
        usedLedgerIds.add(row.ledgerId)
      }
    }
  }

  for (const priorRow of activePriorRows) {
    if (usedPriorRowIds.has(priorRow.id)) {
      continue
    }
    if (priorRow.ledgerId && usedLedgerIds.has(priorRow.ledgerId)) {
      continue
    }

    const openingWdv = getDepreciationClosingWdv(priorRow)
    if (openingWdv <= 0) {
      continue
    }

    const rowId = resolveUniqueRowId(priorRow.id)
    const carriedRow = createCarriedDepreciationRow(priorRow, openingWdv, rowId)
    locks.depRowIds.add(rowId)
    next.push(carriedRow)
    if (carriedRow.ledgerId) {
      usedLedgerIds.add(carriedRow.ledgerId)
    }
  }

  return next.map((row) => recalcDepreciationRow(row))
}

export function applyDepreciationScheduleCarryForward(params: {
  schedule: DepreciationRow[]
  priorSchedule: DepreciationRow[]
  priorClosing: PriorClosingSnapshot
  previousYearDepreciation: PreviousYearDepreciationSummary
  priorFs: FinancialStatementData
  locks: OpeningBalanceLocks
  priorFyId?: string
  depreciationHistory?: AssetDepreciationHistoryRow[]
}): {
  schedule: DepreciationRow[]
  previousYearDepreciation: PreviousYearDepreciationSummary
} {
  const history = params.depreciationHistory ?? []
  const expandedPriorSchedule =
    params.priorFyId && history.length > 0
      ? expandPriorScheduleWithHistory(params.priorSchedule, history, params.priorFyId)
      : params.priorSchedule
  const priorFsWithExpanded = { ...params.priorFs, depreciationSchedule: expandedPriorSchedule }

  return {
    schedule: carryForwardDepreciation(
      params.schedule,
      expandedPriorSchedule,
      params.priorClosing,
      params.locks,
    ),
    previousYearDepreciation: carryForwardPreviousYearDepreciation(
      params.previousYearDepreciation,
      priorFsWithExpanded,
      params.locks,
      params.priorFyId,
      history,
    ),
  }
}

export function hasPriorYearDepreciationSchedule(priorFs: FinancialStatementData): boolean {
  return (priorFs.depreciationSchedule || []).some((row) => {
    const calc = recalcDepreciationRow(row)
    return (
      Boolean(row.ledgerId) ||
      row.assetName.trim() !== '' ||
      calc.openingWdv > 0 ||
      calc.closingWdv > 0 ||
      resolveEffectiveClosingWdv(row) > 0
    )
  })
}

export function hasPriorYearDepreciationData(
  priorFs: FinancialStatementData,
  priorFyId?: string,
  history: AssetDepreciationHistoryRow[] = [],
): boolean {
  if (hasPriorYearDepreciationSchedule(priorFs)) {
    return true
  }

  const prev = priorFs.previousYearDepreciation
  if (
    (prev?.openingWdv ?? 0) > 0 ||
    (prev?.closingWdv ?? 0) > 0 ||
    (prev?.depreciation ?? 0) > 0
  ) {
    return true
  }

  if (priorFyId) {
    return history.some((row) => row.fyId === priorFyId && row.closingWdv > 0)
  }

  return false
}

function resolvePriorYearDepreciationTotals(
  priorFs: FinancialStatementData,
  priorFyId?: string,
  history: AssetDepreciationHistoryRow[] = [],
): PreviousYearDepreciationSummary {
  const scheduleTotals = sumDepreciationSchedule(priorFs.depreciationSchedule || [])
  if (scheduleTotals.closingWdv > 0 || scheduleTotals.openingWdv > 0) {
    return scheduleTotals
  }

  if (priorFyId && history.length > 0) {
    const historyTotals = sumDepreciationHistoryForFy(history, priorFyId)
    if (historyTotals.closingWdv > 0 || historyTotals.openingWdv > 0) {
      return historyTotals
    }
  }

  return priorFs.previousYearDepreciation
}

function carryForwardPreviousYearDepreciation(
  previousYearDepreciation: PreviousYearDepreciationSummary,
  priorFs: FinancialStatementData,
  locks: OpeningBalanceLocks,
  priorFyId?: string,
  history: AssetDepreciationHistoryRow[] = [],
): PreviousYearDepreciationSummary {
  if (
    !hasPriorYearDepreciationData(priorFs, priorFyId, history) &&
    (!priorFyId || history.length === 0)
  ) {
    return previousYearDepreciation
  }

  const totals = resolvePriorYearDepreciationTotals(priorFs, priorFyId, history)
  if (totals.openingWdv === 0 && totals.closingWdv === 0 && totals.depreciation === 0) {
    return previousYearDepreciation
  }

  locks.previousYearDepOpening = true
  locks.previousYearDepLinked = true

  return totals
}

export function buildPriorDepClosingsByLedgerId(
  schedule: DepreciationRow[],
): Map<string, number> {
  const closings = new Map<string, number>()
  for (const row of schedule) {
    if (!row.ledgerId) {
      continue
    }
    closings.set(row.ledgerId, getDepreciationClosingWdv(row))
  }
  return closings
}

export function applyPriorDepClosingToRow(
  row: DepreciationRow,
  priorClosingsByLedgerId: Map<string, number>,
): DepreciationRow {
  if (!row.ledgerId) {
    return row
  }

  const priorWdv = priorClosingsByLedgerId.get(row.ledgerId)
  if (priorWdv === undefined) {
    return row
  }

  return recalcDepreciationRow({
    ...row,
    openingWdv: row.openingWdv !== 0 ? row.openingWdv : priorWdv,
  })
}

export function applyOpeningBalanceCarryForward(params: {
  business: { startingYear: number }
  priorFy: FinancialYear
  priorFs: FinancialStatementData
  priorClosing: PriorClosingSnapshot
  current: Pick<
    FinancialStatementData,
    | 'noteSubAmounts'
    | 'loans'
    | 'bankAccounts'
    | 'depreciationSchedule'
    | 'previousYearDepreciation'
    | 'administrativeExpenseLines'
    | 'otherShortTermBorrowingLines'
    | 'manualNoteLines'
    | 'capitalAccountLines'
  >
}): { data: typeof params.current; locks: OpeningBalanceLocks | null; loansCarriedForward: boolean } {
  const { business, priorFy, priorFs, priorClosing, current } = params

  if (!canCarryForwardFromPriorYear(business, priorFy)) {
    return { data: current, locks: null, loansCarriedForward: false }
  }

  if (!hasMeaningfulPriorYearData(priorFs, priorClosing)) {
    return { data: current, locks: null, loansCarriedForward: false }
  }

  const locks: OpeningBalanceLocks = {
    noteSubs: new Set(),
    loanIds: new Set(),
    bankIds: new Set(),
    depRowIds: new Set(),
    adminExpenseLineIds: new Set(),
    manualNoteLineIds: new Set(),
    previousYearDepOpening: false,
    previousYearDepLinked: false,
  }

  const administrativeExpenseLines = copyLinesIfEmpty(
    current.administrativeExpenseLines ?? [],
    priorFs.administrativeExpenseLines ?? [],
  )
  const otherShortTermBorrowingLines = copyLinesIfEmpty(
    current.otherShortTermBorrowingLines ?? [],
    priorFs.otherShortTermBorrowingLines ?? [],
  )
  const manualNoteLines = copyLinesIfEmpty(
    current.manualNoteLines ?? [],
    priorFs.manualNoteLines ?? [],
  )
  const capitalAccountLines = copyLinesIfEmpty(
    current.capitalAccountLines ?? [],
    priorFs.capitalAccountLines ?? [],
  )

  let noteSubAmounts = applyNoteOpeningCarryForward(
    current.noteSubAmounts,
    priorClosing,
    locks,
  )

  carryAdministrativeExpenseLines(administrativeExpenseLines, priorClosing, locks)
  carryManualNoteLines(manualNoteLines, priorClosing, locks)
  noteSubAmounts = resetAutoCarriedManualEntryAmounts(noteSubAmounts, priorClosing)
  sanitizeNoteSubLocks(locks)

  const { loans: carriedLoans, changed: loansCarriedForward } = carryForwardLoans(
    current.loans,
    priorFs.loans,
    priorClosing,
    locks,
  )

  return {
    data: {
      noteSubAmounts,
      loans: carriedLoans,
      bankAccounts: carryForwardBankAccounts(
        current.bankAccounts,
        priorFs.bankAccounts,
        priorClosing,
        locks,
      ),
      depreciationSchedule: current.depreciationSchedule,
      previousYearDepreciation: current.previousYearDepreciation,
      administrativeExpenseLines,
      otherShortTermBorrowingLines,
      manualNoteLines,
      capitalAccountLines,
    },
    locks,
    loansCarriedForward,
  }
}
