import type { FsNotes } from '../types/fs'

export const MANUAL_NOTE_LINE_KEYS = [
  'otherLongTermLiabilities',
  'longTermProvisions',
  'otherCurrentLiabilities',
  'shortTermProvision',
  'nonCurrentInvestments',
  'longTermLoansAdvances',
  'otherNonCurrentAssets',
  'currentInvestments',
  'shortTermLoansAdvances',
] as const

export type ManualNoteLineKey = (typeof MANUAL_NOTE_LINE_KEYS)[number]

export interface ManualNoteLineType {
  id: string
  label: string
}

export interface ManualNoteLineConfig {
  legacySubId: string
  fallbackLabel: string
  defaultTypeId: string
  totalSubId?: string
  types: ManualNoteLineType[]
}

export const MANUAL_NOTE_LINE_CONFIGS: Record<ManualNoteLineKey, ManualNoteLineConfig> = {
  otherLongTermLiabilities: {
    legacySubId: 'other-long-term',
    fallbackLabel: 'Other Long Term Liabilities',
    defaultTypeId: 'others',
    types: [
      { id: 'security-deposit', label: 'Security Deposits Received' },
      { id: 'deferred-revenue', label: 'Deferred Revenue' },
      { id: 'others', label: 'Others' },
    ],
  },
  longTermProvisions: {
    legacySubId: 'long-term-provision',
    fallbackLabel: 'Long Term Provisions',
    defaultTypeId: 'others',
    types: [
      { id: 'gratuity', label: 'Gratuity' },
      { id: 'leave-encashment', label: 'Leave Encashment' },
      { id: 'warranty', label: 'Warranty Provision' },
      { id: 'others', label: 'Others' },
    ],
  },
  otherCurrentLiabilities: {
    legacySubId: 'other-current-liability',
    fallbackLabel: 'Other Current Liabilities',
    defaultTypeId: 'others',
    types: [
      { id: 'statutory-dues', label: 'Statutory Dues Payable' },
      { id: 'advance-customers', label: 'Advance from Customers' },
      { id: 'unpaid-dividend', label: 'Unpaid Dividend' },
      { id: 'others', label: 'Others' },
    ],
  },
  shortTermProvision: {
    legacySubId: 'short-term-provision',
    fallbackLabel: 'Short Term Provision',
    defaultTypeId: 'others',
    totalSubId: 'stp-total',
    types: [
      { id: 'expense-provision', label: 'Provision for Expenses' },
      { id: 'tax-provision', label: 'Tax Provision' },
      { id: 'others', label: 'Others' },
    ],
  },
  nonCurrentInvestments: {
    legacySubId: 'non-current-investment',
    fallbackLabel: 'Non-Current Investments',
    defaultTypeId: 'others',
    types: [
      { id: 'mutual-funds', label: 'Mutual Funds' },
      { id: 'bonds', label: 'Bonds / Debentures' },
      { id: 'equity-shares', label: 'Equity Shares' },
      { id: 'others', label: 'Others' },
    ],
  },
  longTermLoansAdvances: {
    legacySubId: 'long-term-loans-advances',
    fallbackLabel: 'Long Term Loans and Advances',
    defaultTypeId: 'others',
    types: [
      { id: 'loans-related-party', label: 'Loans to Related Parties' },
      { id: 'advances-suppliers', label: 'Advances to Suppliers' },
      { id: 'security-deposits', label: 'Security Deposits' },
      { id: 'others', label: 'Others' },
    ],
  },
  otherNonCurrentAssets: {
    legacySubId: 'other-non-current',
    fallbackLabel: 'Other Non-Current Assets',
    defaultTypeId: 'others',
    types: [
      { id: 'cwip', label: 'Capital Work in Progress' },
      { id: 'deferred-tax', label: 'Deferred Tax Asset' },
      { id: 'others', label: 'Others' },
    ],
  },
  currentInvestments: {
    legacySubId: 'current-investment',
    fallbackLabel: 'Current Investments',
    defaultTypeId: 'others',
    types: [
      { id: 'mutual-funds', label: 'Mutual Funds' },
      { id: 'fixed-deposits', label: 'Fixed Deposits' },
      { id: 'others', label: 'Others' },
    ],
  },
  shortTermLoansAdvances: {
    legacySubId: 'short-term-loans-advances',
    fallbackLabel: 'Short Term Loans and Advances',
    defaultTypeId: 'others',
    types: [
      { id: 'advances-employees', label: 'Advances to Employees' },
      { id: 'advances-suppliers', label: 'Advances to Suppliers' },
      { id: 'loans-related-party', label: 'Loans to Related Parties' },
      { id: 'others', label: 'Others' },
    ],
  },
}

const typeLabelMaps = new Map<ManualNoteLineKey, Map<string, string>>()

for (const noteKey of MANUAL_NOTE_LINE_KEYS) {
  typeLabelMaps.set(
    noteKey,
    new Map(MANUAL_NOTE_LINE_CONFIGS[noteKey].types.map((item) => [item.id, item.label])),
  )
}

export function isManualNoteLineKey(noteKey: keyof FsNotes): noteKey is ManualNoteLineKey {
  return (MANUAL_NOTE_LINE_KEYS as readonly string[]).includes(noteKey)
}

export function manualNoteLineSubId(lineId: string) {
  return `manual-nl-${lineId}`
}

export function getManualNoteLineLabel(noteKey: ManualNoteLineKey, typeId: string) {
  return typeLabelMaps.get(noteKey)?.get(typeId) ?? 'Others'
}

export function normalizeManualNoteLineTypeId(noteKey: ManualNoteLineKey, typeId: string | undefined) {
  return typeId || MANUAL_NOTE_LINE_CONFIGS[noteKey].defaultTypeId
}

export function getManualNoteLineTypes(noteKey: ManualNoteLineKey) {
  return MANUAL_NOTE_LINE_CONFIGS[noteKey].types
}
