import type { BankAccountRecord } from '../types/bankAccount'
import type { LedgerRecord } from '../types/ledger'
import type {
  AdministrativeExpenseLine,
  CashAdjustment,
  FinancialStatementData,
  FsNotes,
  ManualNoteLine,
  NoteSubAmounts,
  StatementLine,
} from '../types/fs'
import { adminExpenseSubId } from './adminExpenseCategories'
import {
  applyCashRoundOffToFsData,
  getUnroundedCashTotalsFromSubRows,
} from './cashRoundOff'
import { buildBalanceSheetLines } from './balanceSheetBuilder'
import { applyClosingStockLink, applyOpeningStockLink } from './closingStockLink'
import { buildFsDerivedState } from './fsEngine'
import {
  buildComparativeCashAdjustment,
  createEmptyFsData,
  notesWithPreviousFromPriorFy,
} from './fsDefaults'
import {
  getLedgersForGroup,
  resolveAdminExpenseCategoryId,
  resolveAdminExpenseLabel,
} from './ledgerUtils'
import {
  isManualNoteLineKey,
  manualNoteLineSubId,
  type ManualNoteLineKey,
} from './manualNoteLineConfig'
import {
  buildCompleteNoteSubAmounts,
  normalizeNoteSubAmounts,
} from './noteSubFields'
import type { OpeningBalanceLocks } from './openingBalanceCarryForward'
import { sumPlAppropriation } from './plAppropriation'

export type FsAutoGenerateBasis = 'prior-year' | 'fresh'
export type FsAutoGenerateProfitInputMode = 'amount' | 'percent'

export interface FsAutoGenerateInputs {
  basis: FsAutoGenerateBasis
  sales: number
  salesIncreasePctOnPriorYear?: number
  grossProfitInputMode: FsAutoGenerateProfitInputMode
  grossProfit: number
  netProfitInputMode: FsAutoGenerateProfitInputMode
  netProfit: number
  indirectExpensePctOnSales: number
  selectedAdminLedgerIds: string[]
  randomSeed?: number
}

export interface FsAutoGenerateContext {
  clientId: string
  fyId: string
  businessId: string
  ledgers: LedgerRecord[]
  fyStartYear: number
  fyEndYear: number
  previousYearNotes: FsNotes | null
  previousYearSubAmounts: NoteSubAmounts | null
  previousYearManualNoteLines: ManualNoteLine[]
  previousYearAdministrativeExpenseLines: AdministrativeExpenseLine[]
  previousYearCashAdjustment: CashAdjustment | null
  previousYearPlAppropriationAmounts: Record<string, { current: number; previous: number }> | null
  computedLoans: { id: string; closingBalance: number; interestForYear: number; lender: string }[]
  previousYearComputedLoans: {
    id: string
    closingBalance: number
    interestForYear: number
    lender: string
  }[]
  previousYearBankAccounts: BankAccountRecord[]
  openingBalanceLocks: OpeningBalanceLocks | null
}

export interface FsAutoGeneratePreviewSummary {
  sales: number
  grossProfit: number
  netProfit: number
  indirectTotal: number
  sourcesTotal: number
  applicationTotal: number
  diff: number
  priorYearSales?: number
  salesIncreasePct?: number
}

export interface FsAutoGenerateSuggestedAdminExpense {
  label: string
  amount: number
}

export interface FsAutoGeneratePreview {
  draftFsData: FinancialStatementData
  profitAndLoss: StatementLine[]
  balanceSheet: StatementLine[]
  summary: FsAutoGeneratePreviewSummary
  suggestedAdminExpenses: FsAutoGenerateSuggestedAdminExpense[]
  warnings: string[]
}

export interface FsAutoGenerateValidation {
  valid: boolean
  errors: string[]
}

const BS_NOTE_KEYS: Array<keyof FsNotes> = [
  'capitalAccount',
  'otherLongTermLiabilities',
  'longTermProvisions',
  'shortTermBorrowings',
  'tradePayables',
  'otherCurrentLiabilities',
  'shortTermProvision',
  'nonCurrentInvestments',
  'longTermLoansAdvances',
  'otherNonCurrentAssets',
  'currentInvestments',
  'inventoriesTradeReceivables',
  'shortTermLoansAdvances',
  'cashAtBank',
  'cashInHand',
]

const CURRENT_LIABILITY_TYPES = ['statutory-dues', 'advance-customers', 'others'] as const

const EXCLUDED_BS_NOTE_KEYS = new Set<keyof FsNotes>([
  'balancesRevenueAuthority',
  'longTermBorrowings',
])

const HANDLED_BS_NOTE_KEYS = new Set<keyof FsNotes>([
  'capitalAccount',
  'tradePayables',
  'inventoriesTradeReceivables',
  'cashAtBank',
  'cashInHand',
  'otherCurrentLiabilities',
])

const FRESH_BS_RATIOS: Partial<Record<keyof FsNotes, number>> = {
  otherLongTermLiabilities: 0.02,
  longTermProvisions: 0.01,
  shortTermBorrowings: 0.05,
  shortTermProvision: 0.01,
  nonCurrentInvestments: 0.04,
  longTermLoansAdvances: 0.02,
  otherNonCurrentAssets: 0.03,
  currentInvestments: 0.02,
  shortTermLoansAdvances: 0.01,
}

function n(value: number) {
  return Number.isFinite(value) ? value : 0
}

function roundAmount(value: number) {
  return Math.round(n(value))
}

let lineIdCounter = 0

function generateId() {
  lineIdCounter += 1
  return `${Date.now().toString(36)}${lineIdCounter.toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

function createSeededRandom(seed: number) {
  let state = Math.abs(Math.floor(seed)) % 2147483646 || 1
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function setSubAmount(
  noteSubAmounts: NoteSubAmounts,
  noteKey: keyof FsNotes,
  subId: string,
  current: number,
  previous = 0,
) {
  const noteSubs = { ...(noteSubAmounts[noteKey] ?? {}) }
  noteSubs[subId] = { current: roundAmount(current), previous: roundAmount(previous) }
  noteSubAmounts[noteKey] = noteSubs
}

function priorSubCurrent(
  previousYearSubAmounts: NoteSubAmounts | null,
  noteKey: keyof FsNotes,
  subId: string,
) {
  return previousYearSubAmounts?.[noteKey]?.[subId]?.current ?? 0
}

function priorNoteCurrent(previousYearNotes: FsNotes | null, noteKey: keyof FsNotes) {
  return previousYearNotes?.[noteKey]?.current ?? 0
}

/** Prior-year sales from note total, or sales-goods/services/gst-sales subs when total is unset. */
export function resolvePriorYearSales(
  previousYearNotes: FsNotes | null,
  previousYearSubAmounts: NoteSubAmounts | null,
): number {
  const noteTotal = priorNoteCurrent(previousYearNotes, 'revenueFromOperations')
  if (noteTotal > 0) {
    return roundAmount(noteTotal)
  }

  const goods = priorSubCurrent(previousYearSubAmounts, 'revenueFromOperations', 'sales-goods')
  const services = priorSubCurrent(previousYearSubAmounts, 'revenueFromOperations', 'sales-services')
  const combined = goods + services
  if (combined > 0) {
    return roundAmount(combined)
  }

  const gstSales = priorSubCurrent(previousYearSubAmounts, 'revenueFromOperations', 'gst-sales')
  return roundAmount(gstSales)
}

export interface PriorYearProfitAnchors {
  grossProfit: number
  netProfit: number
  grossProfitPctOnSales: number
  netProfitPctOnSales: number
}

function pctOnSales(amount: number, sales: number) {
  if (sales <= 0) {
    return 0
  }
  return Math.round((amount / sales) * 10000) / 100
}

export function resolvePriorYearProfitAnchors(
  previousYearNotes: FsNotes | null,
  previousYearSubAmounts: NoteSubAmounts | null,
  profitAndLoss?: StatementLine[] | null,
): PriorYearProfitAnchors {
  const sales = resolvePriorYearSales(previousYearNotes, previousYearSubAmounts)

  let grossProfit = profitAndLoss?.find((line) => line.label === 'Gross Profit')?.current ?? 0
  let netProfit =
    profitAndLoss?.find((line) => line.label === 'Net Profit / (Loss)')?.current ?? 0

  if (grossProfit <= 0) {
    grossProfit = priorSubCurrent(previousYearSubAmounts, 'costOfGoodsSold', 'gross-profit')
  }

  if (grossProfit <= 0 && sales > 0) {
    const opening = priorSubCurrent(previousYearSubAmounts, 'costOfGoodsSold', 'opening-stock')
    const purchase = priorSubCurrent(previousYearSubAmounts, 'costOfGoodsSold', 'add-purchase')
    const closing = priorSubCurrent(previousYearSubAmounts, 'costOfGoodsSold', 'less-closing-stock')
    const cogs = opening + purchase - closing
    if (cogs >= 0) {
      grossProfit = roundAmount(sales - cogs)
    }
  }

  if (netProfit === 0) {
    const balanceProfit = priorSubCurrent(previousYearSubAmounts, 'capitalAccount', 'balance-profit')
    if (balanceProfit !== 0) {
      netProfit = balanceProfit
    }
  }

  grossProfit = roundAmount(grossProfit)
  netProfit = roundAmount(netProfit)

  return {
    grossProfit,
    netProfit,
    grossProfitPctOnSales: pctOnSales(grossProfit, sales),
    netProfitPctOnSales: pctOnSales(netProfit, sales),
  }
}

function splitWithWeights(total: number, weights: number[]) {
  const sum = weights.reduce((acc, value) => acc + value, 0) || 1
  const amounts = weights.map((weight) => roundAmount((total * weight) / sum))
  const diff = roundAmount(total) - amounts.reduce((acc, value) => acc + value, 0)
  if (amounts.length > 0) {
    amounts[amounts.length - 1] += diff
  }
  return amounts
}

function scaleFromPrior(
  priorAmount: number,
  priorSales: number,
  sales: number,
  fallbackRatio: number,
  jitter: number,
) {
  const ratio = priorSales > 0 ? priorAmount / priorSales : fallbackRatio
  return roundAmount(sales * ratio * (1 + jitter))
}

function priorNoteHadValue(
  noteKey: keyof FsNotes,
  context: FsAutoGenerateContext,
): boolean {
  if (priorNoteCurrent(context.previousYearNotes, noteKey) > 0) {
    return true
  }

  const subs = context.previousYearSubAmounts?.[noteKey]
  if (!subs) {
    return false
  }

  return Object.entries(subs).some(
    ([subId, cell]) => !subId.includes('total') && Math.abs(cell?.current ?? 0) > 0,
  )
}

export function resolveFsAutoGenerateSales(
  inputs: FsAutoGenerateInputs,
  priorYearSales: number,
): number {
  if (
    inputs.basis === 'prior-year' &&
    priorYearSales > 0 &&
    inputs.salesIncreasePctOnPriorYear !== undefined
  ) {
    return roundAmount(priorYearSales * (1 + n(inputs.salesIncreasePctOnPriorYear) / 100))
  }
  return roundAmount(inputs.sales)
}

export function resolveFsAutoGenerateGrossProfit(inputs: FsAutoGenerateInputs, sales: number) {
  if (inputs.grossProfitInputMode === 'percent') {
    return roundAmount((sales * n(inputs.grossProfit)) / 100)
  }
  return roundAmount(inputs.grossProfit)
}

export function resolveFsAutoGenerateNetProfit(inputs: FsAutoGenerateInputs, sales: number) {
  if (inputs.netProfitInputMode === 'percent') {
    return roundAmount((sales * n(inputs.netProfit)) / 100)
  }
  return roundAmount(inputs.netProfit)
}

function getBalanceSheetTotals(balanceSheetLines: StatementLine[]) {
  const applicationHeaderIndex = balanceSheetLines.findIndex(
    (row) => row.isHeader && row.label === 'II. APPLICATION OF FUNDS',
  )
  const sourcesLines =
    applicationHeaderIndex > 0 ? balanceSheetLines.slice(0, applicationHeaderIndex) : balanceSheetLines
  const applicationLines =
    applicationHeaderIndex >= 0 ? balanceSheetLines.slice(applicationHeaderIndex) : []

  const sourcesGrand = sourcesLines.filter((row) => row.isGrandTotal).at(-1)
  const applicationGrand = applicationLines.filter((row) => row.isGrandTotal).at(-1)

  return {
    sourcesTotal: sourcesGrand?.current ?? 0,
    applicationTotal: applicationGrand?.current ?? 0,
  }
}

function buildDerivedPreview(
  draftFsData: FinancialStatementData,
  context: FsAutoGenerateContext,
) {
  const plAppropriationTotal = sumPlAppropriation(
    draftFsData.plAppropriationLines ?? [],
    draftFsData.plAppropriationAmounts ?? {},
    context.previousYearPlAppropriationAmounts,
  )
  const mergedNotes = notesWithPreviousFromPriorFy(draftFsData.notes, context.previousYearNotes)
  const cashAdjustment = buildComparativeCashAdjustment(
    draftFsData.cashAdjustment,
    context.previousYearCashAdjustment,
  )

  const derived = buildFsDerivedState({
    noteCalcContext: {
      notes: mergedNotes,
      noteBreakdowns: draftFsData.noteBreakdowns,
      noteSubAmounts: draftFsData.noteSubAmounts,
      previousYearSubAmounts: context.previousYearSubAmounts,
      depreciationSchedule: draftFsData.depreciationSchedule,
      previousYearDepreciation: draftFsData.previousYearDepreciation,
      loans: draftFsData.loans,
      previousYearNotes: context.previousYearNotes,
      fyStartYear: context.fyStartYear,
      fyEndYear: context.fyEndYear,
      computedLoans: context.computedLoans,
      previousYearComputedLoans: context.previousYearComputedLoans,
      administrativeExpenseLines: draftFsData.administrativeExpenseLines ?? [],
      otherShortTermBorrowingLines: draftFsData.otherShortTermBorrowingLines ?? [],
      manualNoteLines: draftFsData.manualNoteLines ?? [],
      capitalAccountLines: draftFsData.capitalAccountLines ?? [],
      cogsExtraLines: draftFsData.cogsExtraLines ?? [],
      ledgers: context.ledgers,
      plAppropriationTotal,
      bankAccounts: draftFsData.bankAccounts,
      previousYearBankAccounts: context.previousYearBankAccounts,
      cashAdjustment,
    },
    noteSubAmounts: draftFsData.noteSubAmounts,
    previousYearSubAmounts: context.previousYearSubAmounts,
    depreciationSchedule: draftFsData.depreciationSchedule,
    previousYearDepreciation: draftFsData.previousYearDepreciation,
    loans: draftFsData.loans,
    computedLoans: context.computedLoans,
    administrativeExpenseLines: draftFsData.administrativeExpenseLines ?? [],
    previousYearComputedLoans: context.previousYearComputedLoans,
    otherShortTermBorrowingLines: draftFsData.otherShortTermBorrowingLines ?? [],
    manualNoteLines: draftFsData.manualNoteLines ?? [],
    plAppropriationTotal,
    bankAccounts: draftFsData.bankAccounts,
    previousYearBankAccounts: context.previousYearBankAccounts,
    capitalAccountLines: draftFsData.capitalAccountLines ?? [],
    cogsExtraLines: draftFsData.cogsExtraLines ?? [],
    ledgers: context.ledgers,
    openingBalanceLocks: context.openingBalanceLocks,
    cashAdjustment,
    fyStartYear: context.fyStartYear,
    fyEndYear: context.fyEndYear,
  })

  const balanceSheet = buildBalanceSheetLines({
    notes: derived.effectiveNotes,
    tradePayableRows: derived.noteSubRowsMap.tradePayables,
    inventoryRows: derived.noteSubRowsMap.inventoriesTradeReceivables,
    fixedAssetRows: derived.noteSubRowsMap.depreciationAmortization,
  })

  return {
    derived,
    balanceSheet,
    profitAndLoss: derived.computed.profitAndLoss,
  }
}

function buildOtherCurrentLiabilityLines(
  inputs: FsAutoGenerateInputs,
  context: FsAutoGenerateContext,
  sales: number,
  rng: () => number,
  jitter: () => number,
): { lines: ManualNoteLine[]; total: number } {
  const priorLines = context.previousYearManualNoteLines.filter(
    (line) => line.noteKey === 'otherCurrentLiabilities',
  )
  const priorSales = resolvePriorYearSales(context.previousYearNotes, context.previousYearSubAmounts)

  if (inputs.basis === 'prior-year' && priorLines.length > 0 && priorSales > 0) {
    const priorTotal = priorLines.reduce(
      (sum, line) =>
        sum +
        priorSubCurrent(
          context.previousYearSubAmounts,
          'otherCurrentLiabilities',
          manualNoteLineSubId(line.id),
        ),
      0,
    )
    if (priorTotal > 0) {
      return {
        lines: priorLines.map((line) => ({
          id: generateId(),
          noteKey: line.noteKey,
          typeId: line.typeId,
        })),
        total: scaleFromPrior(priorTotal, priorSales, sales, 0.04, jitter()),
      }
    }
  }

  const lineCount = 2 + Math.floor(rng() * 2)
  const lines: ManualNoteLine[] = CURRENT_LIABILITY_TYPES.slice(0, lineCount).map((typeId) => ({
    id: generateId(),
    noteKey: 'otherCurrentLiabilities',
    typeId,
  }))
  const total = roundAmount(sales * (0.03 + rng() * 0.02))
  return { lines, total }
}

function buildManualNoteLinesForPriorYear(
  noteKey: ManualNoteLineKey,
  context: FsAutoGenerateContext,
  priorSales: number,
): ManualNoteLine[] {
  const priorLines = context.previousYearManualNoteLines.filter((line) => line.noteKey === noteKey)
  if (priorLines.length === 0 || priorSales <= 0) {
    return []
  }

  const hasValue = priorLines.some(
    (line) =>
      priorSubCurrent(context.previousYearSubAmounts, noteKey, manualNoteLineSubId(line.id)) > 0,
  )
  if (!hasValue && priorNoteCurrent(context.previousYearNotes, noteKey) <= 0) {
    return []
  }

  return priorLines.map((line) => ({
    id: generateId(),
    noteKey: line.noteKey,
    typeId: line.typeId,
  }))
}

export function getAdminExpenseLedgers(ledgers: LedgerRecord[]) {
  return getLedgersForGroup(ledgers, 'otherAdministrativeExpenses')
}

export function resolveDefaultAdminLedgerIds(
  ledgers: LedgerRecord[],
  priorAdminLines: AdministrativeExpenseLine[],
  max = 6,
): string[] {
  const adminLedgers = getAdminExpenseLedgers(ledgers)
  const available = new Set(adminLedgers.map((ledger) => ledger.id))
  const fromPrior = [
    ...new Set(
      priorAdminLines.map((line) => resolveAdminExpenseCategoryId(ledgers, line.categoryId)),
    ),
  ].filter((ledgerId) => available.has(ledgerId))

  if (fromPrior.length > 0) {
    return fromPrior
  }

  return adminLedgers.slice(0, max).map((ledger) => ledger.id)
}

function normalizeSelectedAdminLedgerIds(ledgers: LedgerRecord[], selectedLedgerIds: string[]) {
  const available = new Set(getAdminExpenseLedgers(ledgers).map((ledger) => ledger.id))
  return [
    ...new Set(
      selectedLedgerIds.map((ledgerId) => resolveAdminExpenseCategoryId(ledgers, ledgerId)),
    ),
  ].filter((ledgerId) => available.has(ledgerId))
}

function resolveSelectedAdminLedgerIds(inputs: FsAutoGenerateInputs, context: FsAutoGenerateContext) {
  return normalizeSelectedAdminLedgerIds(context.ledgers, inputs.selectedAdminLedgerIds)
}

function buildAdminExpenseLines(
  selectedLedgerIds: string[],
): AdministrativeExpenseLine[] {
  return selectedLedgerIds.map((categoryId) => ({
    id: generateId(),
    categoryId,
  }))
}

function adminSplitWeights(
  adminLines: AdministrativeExpenseLine[],
  context: FsAutoGenerateContext,
  rng: () => number,
) {
  return adminLines.map((line) => {
    const priorLine = context.previousYearAdministrativeExpenseLines.find(
      (item) =>
        resolveAdminExpenseCategoryId(context.ledgers, item.categoryId) ===
        resolveAdminExpenseCategoryId(context.ledgers, line.categoryId),
    )
    if (!priorLine) {
      return 0.7 + rng() * 0.6
    }
    const priorAmount = priorSubCurrent(
      context.previousYearSubAmounts,
      'otherAdministrativeExpenses',
      adminExpenseSubId(priorLine.id),
    )
    return priorAmount > 0 ? priorAmount : 1
  })
}

export function validateFsAutoGenerateInputs(
  inputs: FsAutoGenerateInputs,
  options?: { hasPriorYear?: boolean; priorYearSales?: number; ledgers?: LedgerRecord[] },
): FsAutoGenerateValidation {
  const errors: string[] = []
  const hasPriorYear = Boolean(options?.hasPriorYear)
  const priorYearSales = n(options?.priorYearSales ?? 0)
  const sales = resolveFsAutoGenerateSales(inputs, priorYearSales)
  const grossProfit = resolveFsAutoGenerateGrossProfit(inputs, sales)
  const netProfit = resolveFsAutoGenerateNetProfit(inputs, sales)
  const indirectPct = n(inputs.indirectExpensePctOnSales)

  if (inputs.basis === 'prior-year' && hasPriorYear) {
    if (inputs.salesIncreasePctOnPriorYear === undefined || !Number.isFinite(inputs.salesIncreasePctOnPriorYear)) {
      errors.push('Enter the sales increase % since last year.')
    }
    if (priorYearSales <= 0) {
      errors.push('Prior year sales are not available for scaling.')
    }
  } else if (n(inputs.sales) <= 0) {
    errors.push('Sales must be greater than zero.')
  }

  if (sales <= 0) {
    errors.push('Target sales must be greater than zero.')
  }
  if (inputs.grossProfitInputMode === 'percent') {
    if (n(inputs.grossProfit) < 0 || n(inputs.grossProfit) > 100) {
      errors.push('Gross profit % must be between 0 and 100.')
    }
  } else if (n(inputs.grossProfit) < 0) {
    errors.push('Gross profit must be zero or greater.')
  }
  if (inputs.netProfitInputMode === 'percent') {
    if (n(inputs.netProfit) < 0 || n(inputs.netProfit) > 100) {
      errors.push('Net profit % must be between 0 and 100.')
    }
  } else if (n(inputs.netProfit) < 0) {
    errors.push('Net profit must be zero or greater.')
  }
  if (grossProfit < 0 || grossProfit > sales) {
    errors.push('Gross profit must be between 0 and sales.')
  }
  if (netProfit < 0 || netProfit > grossProfit) {
    errors.push('Net profit must be between 0 and gross profit.')
  }
  if (indirectPct < 0 || indirectPct > 100) {
    errors.push('Indirect expenses % must be between 0 and 100.')
  }

  const selectedAdminLedgerIds = options?.ledgers
    ? normalizeSelectedAdminLedgerIds(options.ledgers, inputs.selectedAdminLedgerIds)
    : inputs.selectedAdminLedgerIds

  if (options?.ledgers && getAdminExpenseLedgers(options.ledgers).length > 0 && selectedAdminLedgerIds.length === 0) {
    errors.push('Select at least one administrative expense from your ledger list.')
  }

  return { valid: errors.length === 0, errors }
}

export function fsDataHasGeneratedContent(fsData: FinancialStatementData): boolean {
  const subTotal = Object.values(fsData.noteSubAmounts ?? {}).reduce((noteAcc, subs) => {
    return (
      noteAcc +
      Object.values(subs ?? {}).reduce((subAcc, cell) => subAcc + Math.abs(cell?.current ?? 0), 0)
    )
  }, 0)

  return (
    subTotal > 0 ||
    (fsData.depreciationSchedule?.length ?? 0) > 0 ||
    (fsData.administrativeExpenseLines?.length ?? 0) > 0 ||
    Boolean(fsData.savedAt)
  )
}

export function generateFsAutoPreview(
  inputs: FsAutoGenerateInputs,
  context: FsAutoGenerateContext,
  baseFsData?: FinancialStatementData,
): FsAutoGeneratePreview {
  const priorSales = resolvePriorYearSales(context.previousYearNotes, context.previousYearSubAmounts)
  const validation = validateFsAutoGenerateInputs(inputs, {
    hasPriorYear: priorSales > 0,
    priorYearSales: priorSales,
    ledgers: context.ledgers,
  })
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '))
  }

  const warnings: string[] = []
  lineIdCounter = 0
  const rng = createSeededRandom(inputs.randomSeed ?? Date.now())
  const jitter = () => (rng() - 0.5) * 0.2

  const sales = resolveFsAutoGenerateSales(inputs, priorSales)
  const grossProfit = resolveFsAutoGenerateGrossProfit(inputs, sales)
  const netProfitTarget = resolveFsAutoGenerateNetProfit(inputs, sales)
  const cogs = roundAmount(sales - grossProfit)
  const indirectTotal = roundAmount((sales * n(inputs.indirectExpensePctOnSales)) / 100)

  const priorGoods = priorSubCurrent(context.previousYearSubAmounts, 'revenueFromOperations', 'sales-goods')
  const priorServices = priorSubCurrent(
    context.previousYearSubAmounts,
    'revenueFromOperations',
    'sales-services',
  )
  const priorRevenueTotal = priorGoods + priorServices
  const goodsShare = priorRevenueTotal > 0 ? priorGoods / priorRevenueTotal : 0.8

  let draftFsData: FinancialStatementData = {
    ...(baseFsData ??
      createEmptyFsData(context.clientId, context.fyId, context.businessId)),
    clientId: context.clientId,
    fyId: context.fyId,
    businessId: context.businessId,
    loans: baseFsData?.loans ?? [],
    bankAccounts: baseFsData?.bankAccounts ?? [],
    plAppropriationLines: baseFsData?.plAppropriationLines ?? [],
    plAppropriationAmounts: baseFsData?.plAppropriationAmounts ?? {},
    otherShortTermBorrowingLines: baseFsData?.otherShortTermBorrowingLines ?? [],
    manualNoteLines: [],
    capitalAccountLines: baseFsData?.capitalAccountLines ?? [],
    cogsExtraLines: baseFsData?.cogsExtraLines ?? [],
    gstReco: baseFsData?.gstReco ?? createEmptyFsData(context.clientId, context.fyId, context.businessId).gstReco,
    udinDetails: baseFsData?.udinDetails ?? createEmptyFsData(context.clientId, context.fyId, context.businessId).udinDetails,
    finalizationInfo: baseFsData?.finalizationInfo ?? createEmptyFsData(context.clientId, context.fyId, context.businessId).finalizationInfo,
    previousYearDepreciation: baseFsData?.previousYearDepreciation ?? createEmptyFsData(context.clientId, context.fyId, context.businessId).previousYearDepreciation,
    noteBreakdowns: baseFsData?.noteBreakdowns ?? {},
    depreciationSchedule: [],
    administrativeExpenseLines: [],
    cashAdjustment: { current: 0, previous: 0 },
  }

  const selectedAdminLedgerIds = resolveSelectedAdminLedgerIds(inputs, context)
  if (selectedAdminLedgerIds.length === 0) {
    throw new Error('Select at least one administrative expense from your ledger list.')
  }

  const adminLines = buildAdminExpenseLines(selectedAdminLedgerIds)
  draftFsData.administrativeExpenseLines = adminLines

  const { lines: oclLines, total: oclTotal } = buildOtherCurrentLiabilityLines(
    inputs,
    context,
    sales,
    rng,
    jitter,
  )

  const priorManualLines: ManualNoteLine[] = []
  if (inputs.basis === 'prior-year' && priorSales > 0) {
    for (const noteKey of BS_NOTE_KEYS) {
      if (!isManualNoteLineKey(noteKey) || noteKey === 'otherCurrentLiabilities') {
        continue
      }
      if (!priorNoteHadValue(noteKey, context)) {
        continue
      }
      priorManualLines.push(...buildManualNoteLinesForPriorYear(noteKey, context, priorSales))
    }
  }

  draftFsData.manualNoteLines = [...oclLines, ...priorManualLines]

  let noteSubAmounts = buildCompleteNoteSubAmounts(
    {},
    draftFsData.noteBreakdowns,
    draftFsData.loans,
    adminLines,
    draftFsData.otherShortTermBorrowingLines,
    draftFsData.manualNoteLines,
    draftFsData.bankAccounts,
    draftFsData.capitalAccountLines,
    draftFsData.cogsExtraLines,
    context.ledgers,
  )

  noteSubAmounts = applyOpeningStockLink(noteSubAmounts, context.previousYearSubAmounts)

  const salesGoods = roundAmount(sales * goodsShare)
  const salesServices = roundAmount(sales - salesGoods)
  const otherIncome = roundAmount(
    inputs.basis === 'prior-year' && priorSales > 0 && priorNoteHadValue('otherIncome', context)
      ? scaleFromPrior(
          priorNoteCurrent(context.previousYearNotes, 'otherIncome'),
          priorSales,
          sales,
          0.02,
          jitter(),
        )
      : inputs.basis === 'fresh'
        ? sales * (0.01 + rng() * 0.02)
        : 0,
  )

  const employeeWeight = 0.38 + rng() * 0.08
  const employeeTotal = roundAmount(indirectTotal * employeeWeight)
  let adminTotal = roundAmount(indirectTotal - employeeTotal)

  const impliedNetProfit = roundAmount(grossProfit - employeeTotal - adminTotal + otherIncome)
  if (Math.abs(impliedNetProfit - netProfitTarget) > 1) {
    const adjustment = netProfitTarget - impliedNetProfit
    adminTotal = Math.max(0, adminTotal - adjustment)
    warnings.push(
      `Administrative expenses adjusted by ${roundAmount(adjustment)} to align net profit closer to your target.`,
    )
  }

  const [salary, bonus, welfare, employeeOthers] = splitWithWeights(employeeTotal, [0.82, 0.1, 0.05, 0.03])
  const adminSplits = splitWithWeights(
    adminTotal,
    adminSplitWeights(adminLines, context, rng),
  )
  const suggestedAdminExpenses = adminLines.map((line, index) => ({
    label: resolveAdminExpenseLabel(context.ledgers, line.categoryId),
    amount: adminSplits[index] ?? 0,
  }))

  const closingStock =
    inputs.basis === 'prior-year' && priorSales > 0
      ? scaleFromPrior(
          priorSubCurrent(context.previousYearSubAmounts, 'costOfGoodsSold', 'less-closing-stock') ||
            priorSubCurrent(context.previousYearSubAmounts, 'inventoriesTradeReceivables', 'inventories') ||
            priorNoteCurrent(context.previousYearNotes, 'inventoriesTradeReceivables') * 0.4,
          priorSales,
          sales,
          0.1,
          jitter(),
        )
      : roundAmount(cogs * (0.1 + rng() * 0.05))

  const inventories = closingStock

  const tradeReceivables =
    inputs.basis === 'prior-year' && priorSales > 0
      ? scaleFromPrior(
          priorSubCurrent(
            context.previousYearSubAmounts,
            'inventoriesTradeReceivables',
            'trade-receivables',
          ) ||
            priorNoteCurrent(context.previousYearNotes, 'inventoriesTradeReceivables') * 0.6,
          priorSales,
          sales,
          0.15,
          jitter(),
        )
      : roundAmount(sales * (0.14 + rng() * 0.04))

  const openingStock = priorSubCurrent(
    context.previousYearSubAmounts,
    'costOfGoodsSold',
    'less-closing-stock',
  )
  const addPurchase = Math.max(0, roundAmount(cogs + closingStock - openingStock))

  const payablesTotal =
    inputs.basis === 'prior-year' && priorSales > 0 && priorNoteHadValue('tradePayables', context)
      ? scaleFromPrior(
          priorNoteCurrent(context.previousYearNotes, 'tradePayables'),
          priorSales,
          sales,
          0.12,
          jitter(),
        )
      : inputs.basis === 'fresh'
        ? roundAmount(cogs * (0.12 + rng() * 0.08))
        : 0
  const priorMsme = priorSubCurrent(context.previousYearSubAmounts, 'tradePayables', 'msme')
  const priorOtherCreditors = priorSubCurrent(
    context.previousYearSubAmounts,
    'tradePayables',
    'other-creditors',
  )
  const msmeShare = priorMsme + priorOtherCreditors > 0 ? priorMsme / (priorMsme + priorOtherCreditors) : 0.3
  const [msmePayables, otherCreditors] = splitWithWeights(payablesTotal, [msmeShare, 1 - msmeShare])

  const capitalOpening =
    priorSubCurrent(context.previousYearSubAmounts, 'capitalAccount', 'capital-closing') ||
    priorSubCurrent(context.previousYearSubAmounts, 'capitalAccount', 'opening-balance') ||
    roundAmount(sales * (0.08 + rng() * 0.04))
  const drawings = roundAmount(Math.max(0, netProfitTarget * (0.03 + rng() * 0.05)))

  const cashAtBank =
    inputs.basis === 'prior-year' && priorSales > 0 && priorNoteHadValue('cashAtBank', context)
      ? scaleFromPrior(
          priorNoteCurrent(context.previousYearNotes, 'cashAtBank'),
          priorSales,
          sales,
          0.07,
          jitter(),
        )
      : inputs.basis === 'fresh'
        ? roundAmount(sales * (0.06 + rng() * 0.04))
        : 0

  setSubAmount(noteSubAmounts, 'revenueFromOperations', 'sales-goods', salesGoods)
  setSubAmount(noteSubAmounts, 'revenueFromOperations', 'sales-services', salesServices)
  setSubAmount(noteSubAmounts, 'otherIncome', 'other-income', otherIncome)
  setSubAmount(noteSubAmounts, 'costOfGoodsSold', 'opening-stock', openingStock)
  setSubAmount(noteSubAmounts, 'costOfGoodsSold', 'add-purchase', addPurchase)
  setSubAmount(noteSubAmounts, 'costOfGoodsSold', 'less-closing-stock', closingStock)
  setSubAmount(noteSubAmounts, 'employeeBenefitExpenses', 'salary', salary)
  setSubAmount(noteSubAmounts, 'employeeBenefitExpenses', 'bonus', bonus)
  setSubAmount(noteSubAmounts, 'employeeBenefitExpenses', 'employee-welfare', welfare)
  setSubAmount(noteSubAmounts, 'employeeBenefitExpenses', 'employee-others', employeeOthers)
  setSubAmount(noteSubAmounts, 'financeCost', 'other-finance', 0)
  setSubAmount(noteSubAmounts, 'capitalAccount', 'opening-balance', capitalOpening)
  setSubAmount(noteSubAmounts, 'capitalAccount', 'drawings', drawings)
  if (payablesTotal > 0) {
    setSubAmount(noteSubAmounts, 'tradePayables', 'msme', msmePayables)
    setSubAmount(noteSubAmounts, 'tradePayables', 'other-creditors', otherCreditors)
  }
  setSubAmount(noteSubAmounts, 'inventoriesTradeReceivables', 'inventories', inventories)
  setSubAmount(noteSubAmounts, 'inventoriesTradeReceivables', 'trade-receivables', tradeReceivables)
  if (cashAtBank > 0) {
    setSubAmount(noteSubAmounts, 'cashAtBank', 'cash-at-bank', cashAtBank)
  }
  setSubAmount(noteSubAmounts, 'cashInHand', 'cash-in-hand', 0)

  adminLines.forEach((line, index) => {
    setSubAmount(
      noteSubAmounts,
      'otherAdministrativeExpenses',
      adminExpenseSubId(line.id),
      adminSplits[index] ?? 0,
    )
  })

  if (oclTotal > 0) {
    const oclSplits = splitWithWeights(
      oclTotal,
      oclLines.map((line) => {
        if (inputs.basis === 'prior-year' && priorSales > 0) {
          const priorLine = context.previousYearManualNoteLines.find(
            (item) => item.noteKey === 'otherCurrentLiabilities' && item.typeId === line.typeId,
          )
          if (priorLine) {
            return (
              priorSubCurrent(
                context.previousYearSubAmounts,
                'otherCurrentLiabilities',
                manualNoteLineSubId(priorLine.id),
              ) || 1
            )
          }
        }
        return 0.8 + rng() * 0.4
      }),
    )
    oclLines.forEach((line, index) => {
      setSubAmount(
        noteSubAmounts,
        'otherCurrentLiabilities',
        manualNoteLineSubId(line.id),
        oclSplits[index] ?? 0,
      )
    })
  }

  for (const noteKey of BS_NOTE_KEYS) {
    if (EXCLUDED_BS_NOTE_KEYS.has(noteKey) || HANDLED_BS_NOTE_KEYS.has(noteKey)) {
      continue
    }

    if (inputs.basis === 'prior-year' && !priorNoteHadValue(noteKey, context)) {
      continue
    }

    const amount =
      inputs.basis === 'prior-year' && priorSales > 0
        ? scaleFromPrior(
            priorNoteCurrent(context.previousYearNotes, noteKey),
            priorSales,
            sales,
            FRESH_BS_RATIOS[noteKey] ?? 0.01,
            jitter(),
          )
        : roundAmount(sales * ((FRESH_BS_RATIOS[noteKey] ?? 0.01) * (1 + jitter())))

    if (amount <= 0) {
      continue
    }

    if (isManualNoteLineKey(noteKey)) {
      const manualLines = draftFsData.manualNoteLines.filter((line) => line.noteKey === noteKey)
      if (manualLines.length === 0) {
        continue
      }
      const priorParts = manualLines.map((line) => {
        const priorLine = context.previousYearManualNoteLines.find(
          (item) => item.noteKey === noteKey && item.typeId === line.typeId,
        )
        return priorLine
          ? priorSubCurrent(context.previousYearSubAmounts, noteKey, manualNoteLineSubId(priorLine.id))
          : 1
      })
      const splits = splitWithWeights(amount, priorParts.map((value) => value || 1))
      manualLines.forEach((line, index) => {
        setSubAmount(noteSubAmounts, noteKey, manualNoteLineSubId(line.id), splits[index] ?? 0)
      })
      continue
    }

    const templateSubs = noteSubAmounts[noteKey]
    const editableSubIds = Object.keys(templateSubs ?? {}).filter((subId) => !subId.includes('total'))
    if (editableSubIds.length === 1) {
      setSubAmount(noteSubAmounts, noteKey, editableSubIds[0], amount)
    } else if (editableSubIds.length > 1 && inputs.basis === 'prior-year' && priorSales > 0) {
      const priorParts = editableSubIds.map((subId) =>
        priorSubCurrent(context.previousYearSubAmounts, noteKey, subId),
      )
      const splits = splitWithWeights(
        amount,
        priorParts.map((value) => value || 1),
      )
      editableSubIds.forEach((subId, index) => {
        setSubAmount(noteSubAmounts, noteKey, subId, splits[index] ?? 0)
      })
    } else if (editableSubIds.length > 1) {
      const splits = splitWithWeights(
        amount,
        editableSubIds.map(() => 0.8 + rng() * 0.4),
      )
      editableSubIds.forEach((subId, index) => {
        setSubAmount(noteSubAmounts, noteKey, subId, splits[index] ?? 0)
      })
    }
  }

  noteSubAmounts = applyClosingStockLink(noteSubAmounts)
  noteSubAmounts = normalizeNoteSubAmounts(
    noteSubAmounts,
    draftFsData.noteBreakdowns,
    draftFsData.loans,
    adminLines,
    draftFsData.otherShortTermBorrowingLines,
    draftFsData.manualNoteLines,
    draftFsData.bankAccounts,
    draftFsData.capitalAccountLines,
    draftFsData.cogsExtraLines,
    context.ledgers,
  )

  draftFsData.noteSubAmounts = noteSubAmounts

  let preview = buildDerivedPreview(draftFsData, context)
  let { sourcesTotal, applicationTotal } = getBalanceSheetTotals(preview.balanceSheet)
  let diff = roundAmount(sourcesTotal - applicationTotal)

  if (diff !== 0) {
    draftFsData.cashAdjustment = {
      current: diff,
      previous: 0,
    }
    preview = buildDerivedPreview(draftFsData, context)
    ;({ sourcesTotal, applicationTotal } = getBalanceSheetTotals(preview.balanceSheet))
    diff = roundAmount(sourcesTotal - applicationTotal)
  }

  preview = buildDerivedPreview(draftFsData, context)
  const rawCash = getUnroundedCashTotalsFromSubRows(preview.derived.noteSubRowsMap)
  draftFsData = applyCashRoundOffToFsData(draftFsData, context.ledgers, rawCash)
  preview = buildDerivedPreview(draftFsData, context)
  ;({ sourcesTotal, applicationTotal } = getBalanceSheetTotals(preview.balanceSheet))
  diff = roundAmount(sourcesTotal - applicationTotal)

  if (diff !== 0) {
    warnings.push(`Balance sheet difference of ${diff} remains after cash adjustment.`)
  }

  draftFsData.notes = preview.derived.effectiveNotes

  const actualNetProfit =
    preview.profitAndLoss.find((line) => line.label === 'Net Profit / (Loss)')?.current ?? 0
  if (Math.abs(actualNetProfit - netProfitTarget) > 1) {
    warnings.push(
      `Computed net profit is ${roundAmount(actualNetProfit)} vs target ${netProfitTarget}.`,
    )
  }

  return {
    draftFsData,
    profitAndLoss: preview.profitAndLoss,
    balanceSheet: preview.balanceSheet,
    summary: {
      sales,
      grossProfit,
      netProfit: roundAmount(actualNetProfit),
      indirectTotal,
      sourcesTotal,
      applicationTotal,
      diff,
      priorYearSales: priorSales > 0 ? priorSales : undefined,
      salesIncreasePct:
        inputs.basis === 'prior-year' && inputs.salesIncreasePctOnPriorYear !== undefined
          ? n(inputs.salesIncreasePctOnPriorYear)
          : undefined,
    },
    suggestedAdminExpenses,
    warnings,
  }
}
