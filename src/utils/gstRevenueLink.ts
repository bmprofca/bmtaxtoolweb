import type { NoteSubAmounts } from '../types/fs'
import type { GstRecoStatement } from '../types/gst'
import { getGstTaxableSalesTotal } from './gstCalculator'

/** Sync taxable sales from GST Reco into Note 19 gst-sales row. */
export function applyGstSalesFromRecoToRevenue(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement,
): NoteSubAmounts {
  const total = getGstTaxableSalesTotal(gstReco)
  const existingGstSales = noteSubAmounts.revenueFromOperations?.['gst-sales'] ?? {
    current: 0,
    previous: 0,
  }
  const existingGoods = noteSubAmounts.revenueFromOperations?.['sales-goods'] ?? {
    current: 0,
    previous: 0,
  }
  const existingServices = noteSubAmounts.revenueFromOperations?.['sales-services'] ?? {
    current: 0,
    previous: 0,
  }

  // Legacy: taxable sales were previously written into sales-goods — move to gst-sales once.
  const goodsCurrent =
    existingGstSales.current === 0 &&
    existingGoods.current === total &&
    existingServices.current === 0
      ? 0
      : existingGoods.current

  return {
    ...noteSubAmounts,
    revenueFromOperations: {
      ...noteSubAmounts.revenueFromOperations,
      'sales-goods': { ...existingGoods, current: goodsCurrent },
      'gst-sales': { ...existingGstSales, current: total },
    },
  }
}

/** @deprecated Use applyGstSalesFromRecoToRevenue */
export function applyGstSalesLinkToRevenue(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement,
): NoteSubAmounts {
  return applyGstSalesFromRecoToRevenue(noteSubAmounts, gstReco)
}

/** Overlay GST taxable sales onto note sub-amounts whenever GST Reco data is present. */
export function withGstSalesOnNoteSubAmounts(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement | undefined,
): NoteSubAmounts {
  if (!gstReco) {
    return noteSubAmounts
  }
  return applyGstSalesFromRecoToRevenue(noteSubAmounts, gstReco)
}

/** @deprecated Use withGstSalesOnNoteSubAmounts */
export function withGstSalesLinkOnNoteSubAmounts(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement | undefined,
): NoteSubAmounts {
  return withGstSalesOnNoteSubAmounts(noteSubAmounts, gstReco)
}
