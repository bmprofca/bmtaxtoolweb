import type {
  CashAdjustment,
  DepreciationRow,
  FinalizationInfo,
  FinancialStatementData,
  FsNotes,
  NoteBreakdownRow,
  NoteBreakdowns,
  NoteValue,
  PreviousYearDepreciationSummary,
  RepaymentRow,
  UdinDetails,
} from '../types/fs'
import { createEmptyGstReco } from './gstDefaults'
import { createEmptyNoteSubAmounts } from './noteSubFields'

const emptyNote = (): NoteValue => ({ current: 0, previous: 0 })

export const NOTE_GROUP_ORDER = [
  'I. Sources of Funds',
  'II. Application of Funds',
  'Profit & Loss',
] as const

export const NOTE_FIELDS: {
  key: keyof FsNotes
  label: string
  group: (typeof NOTE_GROUP_ORDER)[number]
  noteNo: string
}[] = [
  { key: 'capitalAccount', label: 'Capital A/c', group: 'I. Sources of Funds', noteNo: '1' },
  { key: 'longTermBorrowings', label: 'Long-term borrowings', group: 'I. Sources of Funds', noteNo: '2' },
  { key: 'otherLongTermLiabilities', label: 'Other long-term liabilities', group: 'I. Sources of Funds', noteNo: '3' },
  { key: 'longTermProvisions', label: 'Long-term provisions', group: 'I. Sources of Funds', noteNo: '4' },
  { key: 'shortTermBorrowings', label: 'Short-term borrowings', group: 'I. Sources of Funds', noteNo: '5' },
  { key: 'tradePayables', label: 'Trade payables', group: 'I. Sources of Funds', noteNo: '6' },
  { key: 'otherCurrentLiabilities', label: 'Other current liabilities', group: 'I. Sources of Funds', noteNo: '7' },
  { key: 'shortTermProvision', label: 'Short-term provisions', group: 'I. Sources of Funds', noteNo: '8' },
  {
    key: 'depreciationAmortization',
    label: 'Fixed Assets',
    group: 'II. Application of Funds',
    noteNo: '9',
  },
  { key: 'nonCurrentInvestments', label: 'Non-current investments', group: 'II. Application of Funds', noteNo: '10' },
  { key: 'longTermLoansAdvances', label: 'Long Term Loans and Advances', group: 'II. Application of Funds', noteNo: '11' },
  { key: 'otherNonCurrentAssets', label: 'Other non-current assets', group: 'II. Application of Funds', noteNo: '12' },
  { key: 'currentInvestments', label: 'Current investments', group: 'II. Application of Funds', noteNo: '13' },
  {
    key: 'inventoriesTradeReceivables',
    label: 'Inventories & Trade receivables',
    group: 'II. Application of Funds',
    noteNo: '14',
  },
  {
    key: 'balancesRevenueAuthority',
    label: 'Balance with Revenue Authorities',
    group: 'II. Application of Funds',
    noteNo: '15',
  },
  {
    key: 'shortTermLoansAdvances',
    label: 'Short Term Loans and Advances',
    group: 'II. Application of Funds',
    noteNo: '16',
  },
  { key: 'cashAtBank', label: 'Cash at Bank', group: 'II. Application of Funds', noteNo: '17' },
  { key: 'cashInHand', label: 'Cash in Hand', group: 'II. Application of Funds', noteNo: '18' },
  { key: 'revenueFromOperations', label: 'Revenue from Operation', group: 'Profit & Loss', noteNo: '19' },
  { key: 'otherIncome', label: 'Other Income', group: 'Profit & Loss', noteNo: '20' },
  { key: 'costOfGoodsSold', label: 'Cost of Goods Sold', group: 'Profit & Loss', noteNo: '21' },
  { key: 'employeeBenefitExpenses', label: 'Employee Benefit Expenses', group: 'Profit & Loss', noteNo: '22' },
  { key: 'otherAdministrativeExpenses', label: 'Other Administrative Expenses', group: 'Profit & Loss', noteNo: '23' },
  { key: 'financeCost', label: 'Finance Cost', group: 'Profit & Loss', noteNo: '24' },
]

function mergeNoteValues(...sources: (NoteValue | undefined)[]): NoteValue {
  return {
    current: sources.reduce((total, source) => total + (source?.current ?? 0), 0),
    previous: sources.reduce((total, source) => total + (source?.previous ?? 0), 0),
  }
}

function legacyCogs(raw: Record<string, NoteValue | undefined>, period: 'current' | 'previous') {
  return (
    (raw.openingStock?.[period] ?? 0) +
    (raw.purchases?.[period] ?? 0) +
    (raw.directExpenses?.[period] ?? 0) -
    (raw.closingStock?.[period] ?? 0)
  )
}

export function createEmptyNotes(): FsNotes {
  return NOTE_FIELDS.reduce((notes, field) => {
    notes[field.key] = emptyNote()
    return notes
  }, {} as FsNotes)
}

export function migrateNotes(raw: Partial<FsNotes> & Record<string, NoteValue | undefined>): FsNotes {
  const empty = createEmptyNotes()

  if (raw.capitalAccount) {
    return { ...empty, ...raw }
  }

  return {
    capitalAccount: mergeNoteValues(raw.capital, raw.reserves),
    longTermBorrowings: raw.securedLoans ?? raw.longTermBorrowings ?? emptyNote(),
    otherLongTermLiabilities: raw.otherLongTermLiabilities ?? emptyNote(),
    longTermProvisions: raw.longTermProvisions ?? emptyNote(),
    shortTermBorrowings: raw.unsecuredLoans ?? raw.shortTermBorrowings ?? emptyNote(),
    tradePayables: raw.creditors ?? raw.tradePayables ?? emptyNote(),
    otherCurrentLiabilities: raw.otherLiabilities ?? raw.otherCurrentLiabilities ?? emptyNote(),
    shortTermProvision: raw.shortTermProvision ?? emptyNote(),
    depreciationAmortization: mergeNoteValues(
      raw.landBuilding,
      raw.plantMachinery,
      raw.furniture,
      raw.vehicles,
      raw.depreciationAmortization,
    ),
    nonCurrentInvestments: raw.nonCurrentInvestments ?? emptyNote(),
    longTermLoansAdvances: raw.longTermLoansAdvances ?? emptyNote(),
    otherNonCurrentAssets: raw.otherNonCurrentAssets ?? raw.otherCurrentAssets ?? emptyNote(),
    currentInvestments: raw.currentInvestments ?? emptyNote(),
    inventoriesTradeReceivables: mergeNoteValues(
      raw.inventory,
      raw.debtors,
      raw.inventoriesTradeReceivables,
    ),
    balancesRevenueAuthority: raw.balancesRevenueAuthority ?? emptyNote(),
    shortTermLoansAdvances: raw.shortTermLoansAdvances ?? emptyNote(),
    cashAtBank: raw.cashBank ?? raw.cashAtBank ?? emptyNote(),
    cashInHand: raw.cashInHand ?? emptyNote(),
    revenueFromOperations: raw.sales ?? raw.revenueFromOperations ?? emptyNote(),
    otherIncome: raw.otherIncome ?? emptyNote(),
    costOfGoodsSold: raw.costOfGoodsSold ?? {
      current: legacyCogs(raw, 'current'),
      previous: legacyCogs(raw, 'previous'),
    },
    employeeBenefitExpenses: raw.employeeBenefitExpenses ?? emptyNote(),
    otherAdministrativeExpenses: raw.adminExpenses ?? raw.otherAdministrativeExpenses ?? emptyNote(),
    financeCost: raw.financialExpenses ?? raw.financeCost ?? emptyNote(),
  }
}

const LEGACY_BREAKDOWN_KEY_MAP: Record<string, keyof FsNotes> = {
  capital: 'capitalAccount',
  reserves: 'capitalAccount',
  securedLoans: 'longTermBorrowings',
  unsecuredLoans: 'shortTermBorrowings',
  creditors: 'tradePayables',
  otherLiabilities: 'otherCurrentLiabilities',
  landBuilding: 'depreciationAmortization',
  plantMachinery: 'depreciationAmortization',
  furniture: 'depreciationAmortization',
  vehicles: 'depreciationAmortization',
  inventory: 'inventoriesTradeReceivables',
  debtors: 'inventoriesTradeReceivables',
  cashBank: 'cashAtBank',
  otherCurrentAssets: 'otherNonCurrentAssets',
  sales: 'revenueFromOperations',
  openingStock: 'costOfGoodsSold',
  purchases: 'costOfGoodsSold',
  closingStock: 'costOfGoodsSold',
  directExpenses: 'costOfGoodsSold',
  adminExpenses: 'otherAdministrativeExpenses',
  financialExpenses: 'financeCost',
}

export function migrateNoteBreakdowns(raw: NoteBreakdowns | undefined): NoteBreakdowns {
  if (!raw) {
    return {}
  }

  const migrated: NoteBreakdowns = { ...raw }

  for (const [legacyKey, targetKey] of Object.entries(LEGACY_BREAKDOWN_KEY_MAP)) {
    const cell = raw[legacyKey as keyof FsNotes]
    if (!cell) {
      continue
    }

    const existing = migrated[targetKey] || { current: [], previous: [] }
    migrated[targetKey] = {
      current: [...existing.current, ...cell.current],
      previous: [...existing.previous, ...cell.previous],
    }
    delete migrated[legacyKey as keyof FsNotes]
  }

  return migrated
}

export function notesWithPreviousFromPriorFy(notes: FsNotes, priorFyNotes: FsNotes | null): FsNotes {
  if (!priorFyNotes) {
    return notes
  }

  const merged = { ...notes }
  for (const field of NOTE_FIELDS) {
    merged[field.key] = {
      current: notes[field.key].current,
      previous: priorFyNotes[field.key].current,
    }
  }
  return merged
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function createDepreciationRow(): DepreciationRow {
  return {
    id: generateId(),
    assetName: '',
    rate: 0,
    openingWdv: 0,
    additionBeforeOct3: 0,
    additionOnAfterOct3: 0,
    assetDeletion: 0,
    depreciation: 0,
    closingWdv: 0,
  }
}

export function createRepaymentRow(): RepaymentRow {
  return {
    id: generateId(),
    lender: '',
    openingBalance: 0,
    addition: 0,
    repayment: 0,
    closingBalance: 0,
  }
}

export function createBreakdownRow(): NoteBreakdownRow {
  return {
    id: generateId(),
    particular: '',
    amount: 0,
  }
}

export function sumBreakdownRows(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
}

export function createEmptyNoteBreakdowns(): NoteBreakdowns {
  return {}
}

export function createEmptyPreviousYearDepreciation(): PreviousYearDepreciationSummary {
  return {
    openingWdv: 0,
    additionBeforeOct3: 0,
    additionOnAfterOct3: 0,
    assetDeletion: 0,
    depreciation: 0,
    closingWdv: 0,
  }
}

export function createEmptyUdinDetails(): UdinDetails {
  return {
    enabled: false,
    caProfileId: '',
    udinNumber: '',
    udinDate: '',
  }
}

export function createEmptyFinalizationInfo(): FinalizationInfo {
  return {
    isFinalized: false,
    isUnlocked: false,
    finalizedAt: '',
    unlockedAt: '',
    lockToken: '',
  }
}

export function createEmptyCashAdjustment(): CashAdjustment {
  return {
    current: 0,
    previous: 0,
  }
}

/** Prior FY current cash adjustment becomes the comparative previous column when viewing the next FY. */
export function buildComparativeCashAdjustment(
  currentYear: Partial<CashAdjustment> | null | undefined,
  priorYear: Partial<CashAdjustment> | null | undefined,
): CashAdjustment {
  const current = {
    current: Number(currentYear?.current) || 0,
    previous: Number(currentYear?.previous) || 0,
  }
  if (!priorYear) {
    return current
  }
  return {
    current: current.current,
    previous: Number(priorYear.current) || 0,
  }
}

export function normalizePreviousYearDepreciation(
  value: number | PreviousYearDepreciationSummary | undefined,
): PreviousYearDepreciationSummary {
  if (typeof value === 'number') {
    return { ...createEmptyPreviousYearDepreciation(), depreciation: value }
  }
  return { ...createEmptyPreviousYearDepreciation(), ...value }
}

export function createEmptyFsData(
  clientId: string,
  fyId: string,
  businessId: string,
): FinancialStatementData {
  return {
    clientId,
    fyId,
    businessId,
    notes: createEmptyNotes(),
    noteBreakdowns: createEmptyNoteBreakdowns(),
    noteSubAmounts: createEmptyNoteSubAmounts(),
    administrativeExpenseLines: [],
    otherShortTermBorrowingLines: [],
    manualNoteLines: [],
    capitalAccountLines: [],
    cogsExtraLines: [],
    plAppropriationLines: [],
    plAppropriationAmounts: {},
    depreciationSchedule: [],
    previousYearDepreciation: createEmptyPreviousYearDepreciation(),
    loans: [],
    bankAccounts: [],
    gstReco: createEmptyGstReco(),
    cashAdjustment: createEmptyCashAdjustment(),
    udinDetails: createEmptyUdinDetails(),
    finalizationInfo: createEmptyFinalizationInfo(),
    updatedAt: new Date().toISOString(),
  }
}

export function recalcRepaymentRow(row: RepaymentRow): RepaymentRow {
  const closingBalance = row.openingBalance + row.addition - row.repayment
  return { ...row, closingBalance }
}
