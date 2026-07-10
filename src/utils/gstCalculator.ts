import type {
  GstInputTaxRow,
  GstInputTaxRowType,
  GstOutwardTaxPaid,
  GstRecoComputed,
  GstRecoStatement,
  GstTaxTriple,
} from '../types/gst'
import { emptyTaxTriple } from './gstDefaults'

function n(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

export function normalizeTaxTriple(value: GstTaxTriple | undefined): GstTaxTriple {
  return {
    igst: n(value?.igst),
    cgst: n(value?.cgst),
    sgst: n(value?.sgst),
  }
}

export function addTaxTriples(a: GstTaxTriple, b: GstTaxTriple): GstTaxTriple {
  return {
    igst: n(a.igst) + n(b.igst),
    cgst: n(a.cgst) + n(b.cgst),
    sgst: n(a.sgst) + n(b.sgst),
  }
}

export function subtractTaxTriples(a: GstTaxTriple, b: GstTaxTriple): GstTaxTriple {
  return {
    igst: n(a.igst) - n(b.igst),
    cgst: n(a.cgst) - n(b.cgst),
    sgst: n(a.sgst) - n(b.sgst),
  }
}

function getRowAmounts(row: GstInputTaxRow): GstTaxTriple {
  return normalizeTaxTriple({ igst: row.igst, cgst: row.cgst, sgst: row.sgst })
}

const SCHEDULE_ADD_TYPES: GstInputTaxRowType[] = [
  'purchases',
  'expenses',
  'rcm',
  'capital-goods',
  'manual-adjustment',
]

const CLOSING_ADD_TYPES: GstInputTaxRowType[] = ['opening', ...SCHEDULE_ADD_TYPES]

const SUBTRACT_TYPES: GstInputTaxRowType[] = ['reversed-fixed-assets', 'used-for-liability']

const SL1_TO6_ADD_TYPES: GstInputTaxRowType[] = [
  'opening',
  'purchases',
  'expenses',
  'rcm',
  'capital-goods',
]

const SL1_TO6_SUBTRACT_TYPES: GstInputTaxRowType[] = ['reversed-fixed-assets']

export function calculateItcSl1To6(rows: GstInputTaxRow[]): GstTaxTriple {
  return rows.reduce((total, row) => {
    const amounts = getRowAmounts(row)
    if (SL1_TO6_ADD_TYPES.includes(row.type)) {
      return addTaxTriples(total, amounts)
    }
    if (SL1_TO6_SUBTRACT_TYPES.includes(row.type)) {
      return subtractTaxTriples(total, amounts)
    }
    return total
  }, emptyTaxTriple())
}

function rowAmountsForCalc(row: GstInputTaxRow, itcCreditUsed: GstTaxTriple): GstTaxTriple {
  if (row.type === 'used-for-liability') {
    return normalizeTaxTriple(itcCreditUsed)
  }
  return getRowAmounts(row)
}

export function calculateItcCurrentYearAsPerSchedule(
  rows: GstInputTaxRow[],
  itcCreditUsed: GstTaxTriple = emptyTaxTriple(),
): GstTaxTriple {
  return rows.reduce((total, row) => {
    if (row.type === 'opening' || row.type === 'closing' || row.type === 'itc-year-sl1-to-6') {
      return total
    }
    const amounts = rowAmountsForCalc(row, itcCreditUsed)
    if (SCHEDULE_ADD_TYPES.includes(row.type)) {
      return addTaxTriples(total, amounts)
    }
    if (SUBTRACT_TYPES.includes(row.type)) {
      return subtractTaxTriples(total, amounts)
    }
    return total
  }, emptyTaxTriple())
}

export function calculateClosingItc(
  rows: GstInputTaxRow[],
  itcCreditUsed: GstTaxTriple = emptyTaxTriple(),
): GstTaxTriple {
  return rows.reduce((total, row) => {
    if (row.type === 'closing' || row.type === 'itc-year-sl1-to-6') {
      return total
    }
    const amounts = rowAmountsForCalc(row, itcCreditUsed)
    if (CLOSING_ADD_TYPES.includes(row.type)) {
      return addTaxTriples(total, amounts)
    }
    if (SUBTRACT_TYPES.includes(row.type)) {
      return subtractTaxTriples(total, amounts)
    }
    return total
  }, emptyTaxTriple())
}

export function computeOutwardTaxPayment(paid: GstOutwardTaxPaid) {
  const totalPaidTowardLiability: GstTaxTriple = {
    igst:
      n(paid.igstCreditToIgst) +
      n(paid.cgstCreditToIgst) +
      n(paid.sgstCreditToIgst) +
      n(paid.cashIgst),
    cgst: n(paid.igstCreditToCgst) + n(paid.cgstCreditToCgst) + n(paid.cashCgst),
    sgst: n(paid.igstCreditToSgst) + n(paid.sgstCreditToSgst) + n(paid.cashSgst),
  }

  const itcCreditUsed: GstTaxTriple = {
    igst: n(paid.igstCreditToIgst) + n(paid.igstCreditToCgst) + n(paid.igstCreditToSgst),
    cgst: n(paid.cgstCreditToIgst) + n(paid.cgstCreditToCgst),
    sgst: n(paid.sgstCreditToIgst) + n(paid.sgstCreditToSgst),
  }

  return { totalPaidTowardLiability, itcCreditUsed }
}

export function computeGstReco(statement: GstRecoStatement): GstRecoComputed {
  const regularTax = normalizeTaxTriple({
    igst: statement.sales.igst,
    cgst: statement.sales.cgst,
    sgst: statement.sales.sgst,
  })
  const amendedTax = normalizeTaxTriple({
    igst: statement.sales.amendedIgst,
    cgst: statement.sales.amendedCgst,
    sgst: statement.sales.amendedSgst,
  })
  const outputTax = addTaxTriples(regularTax, amendedTax)

  const paid = statement.outwardTaxPaid
  const { totalPaidTowardLiability, itcCreditUsed } = computeOutwardTaxPayment(paid)
  const balanceLiability = subtractTaxTriples(outputTax, totalPaidTowardLiability)

  const calculatedClosing = calculateClosingItc(statement.inputTax.rows, itcCreditUsed)
  const closing = statement.inputTax.linkClosingToNotes
    ? normalizeTaxTriple(statement.inputTax.closingFromNotes)
    : calculatedClosing

  const itcClaimedIn3bThisFy = normalizeTaxTriple(statement.simpleReco.itcClaimedIn3bThisFy)
  const itcPrevYearClaimedThisYear = normalizeTaxTriple(statement.simpleReco.itcPrevYearClaimedThisYear)
  const itcAsPer2b = normalizeTaxTriple(statement.simpleReco.itcAsPer2b)
  const itcThisYearClaimedIn3b = subtractTaxTriples(itcClaimedIn3bThisFy, itcPrevYearClaimedThisYear)
  const itcAsPerSchedule = calculateItcCurrentYearAsPerSchedule(statement.inputTax.rows, itcCreditUsed)
  const itcSl1To6 = calculateItcSl1To6(statement.inputTax.rows)
  const claimInNextYear = subtractTaxTriples(itcThisYearClaimedIn3b, itcSl1To6)
  const diff2bVs3b = subtractTaxTriples(itcAsPer2b, itcThisYearClaimedIn3b)

  return {
    outputTax,
    outwardTax: {
      outputTax,
      paid,
      totalPaidTowardLiability,
      itcCreditUsed,
      balanceLiability,
    },
    inputTax: {
      rows: statement.inputTax.rows,
      itcSl1To6,
      itcUsedForLiability: itcCreditUsed,
      calculatedClosing,
      closing,
    },
    simpleReco: {
      itcClaimedIn3bThisFy,
      itcPrevYearClaimedThisYear,
      itcThisYearClaimedIn3b,
      itcAsPerSchedule,
      itcSl1To6,
      claimInNextYear,
      itcAsPer2b,
      diff2bVs3b,
    },
  }
}

export function isInputRowEditable(type: GstInputTaxRowType, linkClosingToNotes: boolean) {
  if (type === 'itc-year-sl1-to-6' || type === 'used-for-liability') {
    return false
  }
  return type !== 'closing' || linkClosingToNotes
}

export function getGstTaxableSalesTotal(gstReco: GstRecoStatement): number {
  return n(gstReco.sales.sales) + n(gstReco.sales.amendedSales)
}

export const GST_LINKED_REVENUE_SUB_IDS = ['gst-sales'] as const

export function isGstLinkedRevenueSub(subId: string): boolean {
  return (GST_LINKED_REVENUE_SUB_IDS as readonly string[]).includes(subId)
}
