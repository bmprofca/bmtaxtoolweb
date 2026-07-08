import type { FsNotes, StatementLine } from '../types/fs'
import type { ResolvedSubRow } from './noteSubFields'

function n(value: number) {
  return Number.isFinite(value) ? value : 0
}

function line(
  label: string,
  current: number,
  previous: number,
  opts?: Partial<StatementLine>,
): StatementLine {
  const row: StatementLine = { label, current: n(current), previous: n(previous), ...opts }
  if (row.noteKey) {
    row.rowId = balanceSheetRowId(row.noteKey, row.noteSubId)
  }
  return row
}

export function balanceSheetRowId(noteKey: keyof FsNotes, noteSubId?: string) {
  return noteSubId ? `bs-row-${noteKey}-${noteSubId}` : `bs-row-${noteKey}`
}

export function isBalanceSheetNoteNo(noteNo: string) {
  const value = Number.parseInt(noteNo, 10)
  return Number.isFinite(value) && value >= 1 && value <= 18
}

export const NOTE_SUB_BALANCE_SHEET_REFS: Record<string, string> = {
  msme: '6.a',
  'other-creditors': '6.b',
  inventories: '14',
  'trade-receivables': '14',
  'gross-book-value': '9',
  'less-depreciation': '9',
  'net-book-value': '9',
}

function subAmount(rows: ResolvedSubRow[], id: string) {
  const row = rows.find((item) => item.id === id)
  return { current: row?.current ?? 0, previous: row?.previous ?? 0 }
}

function sumLines(values: { current: number; previous: number }[]) {
  return values.reduce(
    (acc, value) => ({
      current: acc.current + n(value.current),
      previous: acc.previous + n(value.previous),
    }),
    { current: 0, previous: 0 },
  )
}

export interface BalanceSheetBuildInput {
  notes: FsNotes
  tradePayableRows: ResolvedSubRow[]
  inventoryRows: ResolvedSubRow[]
  fixedAssetRows: ResolvedSubRow[]
}

export function buildBalanceSheetLines(input: BalanceSheetBuildInput): StatementLine[] {
  const { notes, tradePayableRows, inventoryRows, fixedAssetRows } = input

  const msme = subAmount(tradePayableRows, 'msme')
  const otherCreditors = subAmount(tradePayableRows, 'other-creditors')
  const inventories = subAmount(inventoryRows, 'inventories')
  const tradeReceivables = subAmount(inventoryRows, 'trade-receivables')
  const grossBook = subAmount(fixedAssetRows, 'gross-book-value')
  const lessDepreciation = subAmount(fixedAssetRows, 'less-depreciation')
  const netBook = subAmount(fixedAssetRows, 'net-book-value')

  const ownersFund = {
    current: notes.capitalAccount.current,
    previous: notes.capitalAccount.previous,
  }

  const nonCurrentLiabilities = sumLines([
    notes.longTermBorrowings,
    notes.otherLongTermLiabilities,
    notes.longTermProvisions,
  ])

  const tradePayablesTotal = sumLines([msme, otherCreditors])

  const currentLiabilities = sumLines([
    notes.shortTermBorrowings,
    tradePayablesTotal,
    notes.otherCurrentLiabilities,
    notes.shortTermProvision,
  ])

  const sourcesTotal = sumLines([ownersFund, nonCurrentLiabilities, currentLiabilities])

  const nonCurrentAssets = sumLines([
    netBook,
    notes.nonCurrentInvestments,
    notes.longTermLoansAdvances,
    notes.otherNonCurrentAssets,
  ])

  const cashInHand = {
    current: notes.cashInHand.current,
    previous: notes.cashInHand.previous,
  }

  const currentAssets = sumLines([
    notes.currentInvestments,
    inventories,
    tradeReceivables,
    notes.balancesRevenueAuthority,
    notes.shortTermLoansAdvances,
    notes.cashAtBank,
    cashInHand,
  ])

  const applicationTotal = sumLines([nonCurrentAssets, currentAssets])

  return [
    line('I. SOURCES OF FUNDS', 0, 0, { isHeader: true }),
    line('1. Owners Fund', 0, 0, { isSubHeader: true, indent: 0 }),
    line('', 0, 0, { isSpacer: true }),
    line('(a) Capital A/c', ownersFund.current, ownersFund.previous, {
      indent: 1,
      noteNo: '1',
      noteKey: 'capitalAccount',
    }),
    line('', ownersFund.current, ownersFund.previous, { isTotal: true, indent: 1 }),

    line('2. Non-current liabilities', 0, 0, { isSubHeader: true }),
    line('(a) Long-term borrowings', notes.longTermBorrowings.current, notes.longTermBorrowings.previous, {
      indent: 1,
      noteNo: '2',
      noteKey: 'longTermBorrowings',
    }),
    line(
      '(b) Other long-term liabilities',
      notes.otherLongTermLiabilities.current,
      notes.otherLongTermLiabilities.previous,
      { indent: 1, noteNo: '3', noteKey: 'otherLongTermLiabilities' },
    ),
    line('(c) Long-term provisions', notes.longTermProvisions.current, notes.longTermProvisions.previous, {
      indent: 1,
      noteNo: '4',
      noteKey: 'longTermProvisions',
    }),
    line('', nonCurrentLiabilities.current, nonCurrentLiabilities.previous, { isTotal: true, indent: 1 }),

    line('3. Current Liabilities', 0, 0, { isSubHeader: true }),
    line('(a) Short-term borrowings', notes.shortTermBorrowings.current, notes.shortTermBorrowings.previous, {
      indent: 1,
      noteNo: '5',
      noteKey: 'shortTermBorrowings',
    }),
    line('(b) Trade payables', 0, 0, {
      indent: 1,
      noteNo: '6',
      noteKey: 'tradePayables',
      blankAmounts: true,
    }),
    line(
      '(i) Total outstanding dues of micro, small and medium enterprises',
      msme.current,
      msme.previous,
      { indent: 2, noteNo: '6.a', noteKey: 'tradePayables', noteSubId: 'msme' },
    ),
    line(
      '(ii) Total outstanding dues of creditors other than micro, small and medium enterprises',
      otherCreditors.current,
      otherCreditors.previous,
      { indent: 2, noteNo: '6.b', noteKey: 'tradePayables', noteSubId: 'other-creditors' },
    ),
    line(
      '(c) Other current liabilities',
      notes.otherCurrentLiabilities.current,
      notes.otherCurrentLiabilities.previous,
      { indent: 1, noteNo: '7', noteKey: 'otherCurrentLiabilities' },
    ),
    line('(d) Short-term provisions', notes.shortTermProvision.current, notes.shortTermProvision.previous, {
      indent: 1,
      noteNo: '8',
      noteKey: 'shortTermProvision',
    }),
    line('', currentLiabilities.current, currentLiabilities.previous, { isTotal: true, indent: 1 }),
    line('Total', sourcesTotal.current, sourcesTotal.previous, { isGrandTotal: true, isTotal: true }),

    line('II. APPLICATION OF FUNDS', 0, 0, { isHeader: true }),
    line('1. Non-current assets', 0, 0, { isSubHeader: true }),
    line('(a) Fixed Assets', 0, 0, {
      indent: 1,
      noteNo: '9',
      noteKey: 'depreciationAmortization',
      blankAmounts: true,
    }),
    line('Gross Book Value', grossBook.current, grossBook.previous, {
      indent: 2,
      noteKey: 'depreciationAmortization',
      noteSubId: 'gross-book-value',
    }),
    line('Less : Depreciation', lessDepreciation.current, lessDepreciation.previous, {
      indent: 2,
      isSubLine: true,
      noteKey: 'depreciationAmortization',
      noteSubId: 'less-depreciation',
    }),
    line('Net Book Value', netBook.current, netBook.previous, {
      indent: 2,
      isTotal: true,
      noteKey: 'depreciationAmortization',
      noteSubId: 'net-book-value',
    }),
    line(
      '(b) Non-current investments',
      notes.nonCurrentInvestments.current,
      notes.nonCurrentInvestments.previous,
      { indent: 1, noteNo: '10', noteKey: 'nonCurrentInvestments' },
    ),
    line(
      '(c) Long Term Loans and Advances',
      notes.longTermLoansAdvances.current,
      notes.longTermLoansAdvances.previous,
      { indent: 1, noteNo: '11', noteKey: 'longTermLoansAdvances' },
    ),
    line(
      '(d) Other non-current assets',
      notes.otherNonCurrentAssets.current,
      notes.otherNonCurrentAssets.previous,
      { indent: 1, noteNo: '12', noteKey: 'otherNonCurrentAssets' },
    ),
    line('', nonCurrentAssets.current, nonCurrentAssets.previous, { isTotal: true, indent: 1 }),

    line('2. Current Assets', 0, 0, { isSubHeader: true }),
    line('(a) Current investments', notes.currentInvestments.current, notes.currentInvestments.previous, {
      indent: 1,
      noteNo: '13',
      noteKey: 'currentInvestments',
    }),
    line('(b) Inventories', inventories.current, inventories.previous, {
      indent: 1,
      noteNo: '14',
      noteKey: 'inventoriesTradeReceivables',
      noteSubId: 'inventories',
    }),
    line('(c) Trade receivables', tradeReceivables.current, tradeReceivables.previous, {
      indent: 1,
      noteNo: '14',
      noteKey: 'inventoriesTradeReceivables',
      noteSubId: 'trade-receivables',
    }),
    line(
      '(d) Balance with Revenue Authorities',
      notes.balancesRevenueAuthority.current,
      notes.balancesRevenueAuthority.previous,
      { indent: 1, noteNo: '15', noteKey: 'balancesRevenueAuthority' },
    ),
    line(
      '(e) Short Term Loans and Advances',
      notes.shortTermLoansAdvances.current,
      notes.shortTermLoansAdvances.previous,
      { indent: 1, noteNo: '16', noteKey: 'shortTermLoansAdvances' },
    ),
    line('(f) Cash at Bank', notes.cashAtBank.current, notes.cashAtBank.previous, {
      indent: 1,
      noteNo: '17',
      noteKey: 'cashAtBank',
    }),
    line('(g) Cash in Hand', cashInHand.current, cashInHand.previous, {
      indent: 1,
      noteNo: '18',
      noteKey: 'cashInHand',
    }),
    line('', currentAssets.current, currentAssets.previous, { isTotal: true, indent: 1 }),
    line('Total', applicationTotal.current, applicationTotal.previous, { isGrandTotal: true, isTotal: true }),
  ]
}
