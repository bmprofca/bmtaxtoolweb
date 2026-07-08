import type {
  GstInputTaxRow,
  GstInputTaxRowType,
  GstOutwardTaxPaid,
  GstRecoStatement,
  GstSimpleReco,
  GstTaxTriple,
} from '../types/gst'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function emptyTaxTriple(): GstTaxTriple {
  return { igst: 0, cgst: 0, sgst: 0 }
}

const INPUT_TAX_ROWS: { type: GstInputTaxRowType; particular: string }[] = [
  { type: 'opening', particular: 'Opening ITC' },
  { type: 'purchases', particular: 'ITC from purchases during the year' },
  { type: 'expenses', particular: 'ITC from expenses during the year' },
  { type: 'rcm', particular: 'ITC from RCM' },
  { type: 'capital-goods', particular: 'ITC from capital goods' },
  { type: 'reversed-fixed-assets', particular: 'Less: ITC reversed (fixed assets)' },
  {
    type: 'itc-year-sl1-to-6',
    particular: 'ITC of this year (consider adjustments for S.No 1 to 6)',
  },
  { type: 'used-for-liability', particular: 'Less: ITC used for paying tax liability (linked from Sec. 2)' },
  { type: 'manual-adjustment', particular: 'Manual adjustment (optional)' },
  { type: 'closing', particular: 'Closing ITC' },
]

export function createInputTaxRows(): GstInputTaxRow[] {
  return INPUT_TAX_ROWS.map((row) => ({
    id: generateId(),
    type: row.type,
    particular: row.particular,
    igst: 0,
    cgst: 0,
    sgst: 0,
  }))
}

export function createEmptyOutwardTaxPaid(): GstOutwardTaxPaid {
  return {
    igstCreditToIgst: 0,
    igstCreditToCgst: 0,
    igstCreditToSgst: 0,
    cgstCreditToIgst: 0,
    cgstCreditToCgst: 0,
    sgstCreditToIgst: 0,
    sgstCreditToSgst: 0,
    cashIgst: 0,
    cashCgst: 0,
    cashSgst: 0,
  }
}

function migrateOutwardTaxPaid(value: Partial<GstOutwardTaxPaid> | Record<string, number> | undefined): GstOutwardTaxPaid {
  const empty = createEmptyOutwardTaxPaid()
  if (!value) {
    return empty
  }

  if ('igstCreditToIgst' in value) {
    return { ...empty, ...value }
  }

  const legacy = value as {
    paidUsingIgst?: number
    paidUsingCgst?: number
    paidUsingSgst?: number
    cashIgst?: number
    cashCgst?: number
    cashSgst?: number
  }

  return {
    ...empty,
    igstCreditToIgst: legacy.paidUsingIgst || 0,
    cgstCreditToCgst: legacy.paidUsingCgst || 0,
    sgstCreditToSgst: legacy.paidUsingSgst || 0,
    cashIgst: legacy.cashIgst || 0,
    cashCgst: legacy.cashCgst || 0,
    cashSgst: legacy.cashSgst || 0,
  }
}

function migrateSimpleReco(value: GstSimpleReco | Record<string, unknown> | undefined): GstSimpleReco {
  const empty = {
    itcClaimedIn3bThisFy: emptyTaxTriple(),
    itcPrevYearClaimedThisYear: emptyTaxTriple(),
    itcAsPer2b: emptyTaxTriple(),
  }

  if (!value || typeof value !== 'object') {
    return empty
  }

  if ('itcClaimedIn3bThisFy' in value) {
    const current = value as GstSimpleReco
    return {
      itcClaimedIn3bThisFy: { ...emptyTaxTriple(), ...current.itcClaimedIn3bThisFy },
      itcPrevYearClaimedThisYear: { ...emptyTaxTriple(), ...current.itcPrevYearClaimedThisYear },
      itcAsPer2b: { ...emptyTaxTriple(), ...current.itcAsPer2b },
    }
  }

  const legacy = value as {
    itcClaimedAsPer3b?: GstTaxTriple
    itcClaimedFromPrevYears?: GstTaxTriple
    itcAsPer2b?: GstTaxTriple
    prevYearItcClaimedThisYear?: GstTaxTriple
  }

  return {
    itcClaimedIn3bThisFy: { ...emptyTaxTriple(), ...legacy.itcClaimedAsPer3b },
    itcPrevYearClaimedThisYear: {
      ...emptyTaxTriple(),
      ...legacy.itcClaimedFromPrevYears,
      ...legacy.prevYearItcClaimedThisYear,
    },
    itcAsPer2b: { ...emptyTaxTriple(), ...legacy.itcAsPer2b },
  }
}

export function createEmptyGstReco(): GstRecoStatement {
  return {
    sales: {
      sales: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      amendedSales: 0,
      amendedIgst: 0,
      amendedCgst: 0,
      amendedSgst: 0,
    },
    outwardTaxPaid: createEmptyOutwardTaxPaid(),
    inputTax: {
      rows: createInputTaxRows(),
      linkClosingToNotes: false,
      closingFromNotes: emptyTaxTriple(),
    },
    simpleReco: {
      itcClaimedIn3bThisFy: emptyTaxTriple(),
      itcPrevYearClaimedThisYear: emptyTaxTriple(),
      itcAsPer2b: emptyTaxTriple(),
    },
    linkSalesToRevenueNote: false,
  }
}

function isLegacyGstReco(value: unknown): value is { sections?: unknown[] } {
  return Boolean(value && typeof value === 'object' && 'sections' in value && !('sales' in value))
}

export function normalizeGstReco(value: GstRecoStatement | undefined): GstRecoStatement {
  const empty = createEmptyGstReco()

  if (!value || isLegacyGstReco(value)) {
    return empty
  }

  const templateRows = createInputTaxRows()

  return {
    sales: { ...empty.sales, ...value.sales },
    outwardTaxPaid: migrateOutwardTaxPaid(value.outwardTaxPaid),
    inputTax: {
      linkClosingToNotes: value.inputTax?.linkClosingToNotes ?? false,
      closingFromNotes: { ...emptyTaxTriple(), ...value.inputTax?.closingFromNotes },
      rows: templateRows.map((template) => {
        const existing = value.inputTax?.rows?.find((row) => row.type === template.type)
        return existing
          ? {
              ...template,
              ...existing,
              particular: existing.particular || template.particular,
            }
          : template
      }),
    },
    simpleReco: migrateSimpleReco(value.simpleReco),
    linkSalesToRevenueNote: value.linkSalesToRevenueNote ?? false,
  }
}
