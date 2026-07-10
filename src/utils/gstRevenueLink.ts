import type { NoteSubAmounts } from '../types/fs'
import type { GstRecoStatement } from '../types/gst'
import { getGstTaxableSalesTotal } from './gstCalculator'

export function applyGstSalesLinkToRevenue(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement,
): NoteSubAmounts {
  if (!gstReco.linkSalesToRevenueNote) {
    return noteSubAmounts
  }

  const total = getGstTaxableSalesTotal(gstReco)
  const existingGoods = noteSubAmounts.revenueFromOperations?.['sales-goods'] ?? {
    current: 0,
    previous: 0,
  }
  const existingServices = noteSubAmounts.revenueFromOperations?.['sales-services'] ?? {
    current: 0,
    previous: 0,
  }

  return {
    ...noteSubAmounts,
    revenueFromOperations: {
      ...noteSubAmounts.revenueFromOperations,
      'sales-goods': { ...existingGoods, current: total },
      'sales-services': { ...existingServices, current: 0 },
    },
  }
}

/** Overlay GST taxable sales onto note sub-amounts whenever the link is active. */
export function withGstSalesLinkOnNoteSubAmounts(
  noteSubAmounts: NoteSubAmounts,
  gstReco: GstRecoStatement | undefined,
): NoteSubAmounts {
  if (!gstReco?.linkSalesToRevenueNote) {
    return noteSubAmounts
  }
  return applyGstSalesLinkToRevenue(noteSubAmounts, gstReco)
}
