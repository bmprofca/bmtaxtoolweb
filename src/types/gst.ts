export interface GstTaxTriple {
  igst: number
  cgst: number
  sgst: number
}

export type GstInputTaxRowType =
  | 'opening'
  | 'purchases'
  | 'expenses'
  | 'rcm'
  | 'capital-goods'
  | 'reversed-fixed-assets'
  | 'itc-year-sl1-to-6'
  | 'used-for-liability'
  | 'manual-adjustment'
  | 'closing'

export interface GstInputTaxRow {
  id: string
  type: GstInputTaxRowType
  particular: string
  igst: number
  cgst: number
  sgst: number
}

export interface GstSalesSection {
  sales: number
  igst: number
  cgst: number
  sgst: number
  amendedSales: number
  amendedIgst: number
  amendedCgst: number
  amendedSgst: number
}

/** ITC credit applied against output tax liability (CGST ↔ SGST not allowed) */
export interface GstOutwardTaxPaid {
  igstCreditToIgst: number
  igstCreditToCgst: number
  igstCreditToSgst: number
  cgstCreditToIgst: number
  cgstCreditToCgst: number
  sgstCreditToIgst: number
  sgstCreditToSgst: number
  cashIgst: number
  cashCgst: number
  cashSgst: number
}

export interface GstInputTaxSheet {
  rows: GstInputTaxRow[]
  linkClosingToNotes: boolean
  closingFromNotes: GstTaxTriple
}

export interface GstSimpleReco {
  itcClaimedIn3bThisFy: GstTaxTriple
  itcPrevYearClaimedThisYear: GstTaxTriple
  itcAsPer2b: GstTaxTriple
}

export interface GstRecoStatement {
  sales: GstSalesSection
  outwardTaxPaid: GstOutwardTaxPaid
  inputTax: GstInputTaxSheet
  simpleReco: GstSimpleReco
  /** When true, Note 19 revenue (sales lines) is fed from GST Reco taxable sales */
  linkSalesToRevenueNote?: boolean
}

export interface GstInputTaxComputed {
  rows: GstInputTaxRow[]
  itcSl1To6: GstTaxTriple
  itcUsedForLiability: GstTaxTriple
  calculatedClosing: GstTaxTriple
  closing: GstTaxTriple
}

export interface GstOutwardTaxComputed {
  outputTax: GstTaxTriple
  paid: GstOutwardTaxPaid
  totalPaidTowardLiability: GstTaxTriple
  itcCreditUsed: GstTaxTriple
  balanceLiability: GstTaxTriple
}

export interface GstRecoComputed {
  outputTax: GstTaxTriple
  outwardTax: GstOutwardTaxComputed
  inputTax: GstInputTaxComputed
  simpleReco: {
    itcClaimedIn3bThisFy: GstTaxTriple
    itcPrevYearClaimedThisYear: GstTaxTriple
    itcThisYearClaimedIn3b: GstTaxTriple
    itcAsPerSchedule: GstTaxTriple
    itcSl1To6: GstTaxTriple
    claimInNextYear: GstTaxTriple
    itcAsPer2b: GstTaxTriple
    diff2bVs3b: GstTaxTriple
  }
}

export interface GstRecoHistoryRow {
  id: string
  fyId: string
  fyLabel: string
  fyStartYear: number
  gstReco: GstRecoStatement
  createdAt?: string
  updatedAt?: string
}

/** @deprecated old format */
export interface GstRecoSection {
  id: string
  title: string
  tableRef: string
  rows: unknown[]
}
