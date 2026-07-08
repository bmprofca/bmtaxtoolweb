export const OTHER_SHORT_TERM_BORROWING_TYPES = [
  { id: 'cash-credit', label: 'Cash Credit' },
  { id: 'overdraft', label: 'Overdraft' },
  { id: 'packing-credit', label: 'Packing Credit' },
  { id: 'bill-discounting', label: 'Bill Discounting' },
  { id: 'working-capital-loan', label: 'Working Capital Demand Loan' },
  { id: 'letter-of-credit', label: 'Letter of Credit' },
  { id: 'bank-guarantee', label: 'Bank Guarantee' },
  { id: 'others', label: 'Others' },
] as const

export type OtherShortTermBorrowingTypeId = (typeof OTHER_SHORT_TERM_BORROWING_TYPES)[number]['id']

const typeLabelMap = new Map(
  OTHER_SHORT_TERM_BORROWING_TYPES.map((item) => [item.id, item.label]),
)

export function getOtherShortTermBorrowingLabel(typeId: string) {
  return typeLabelMap.get(typeId as OtherShortTermBorrowingTypeId) ?? 'Others'
}

export function normalizeOtherShortTermBorrowingTypeId(typeId: string | undefined): string {
  return typeId || 'others'
}

export function manualShortTermSubId(lineId: string) {
  return `manual-st-${lineId}`
}

export function manualShortTermInterestSubId(lineId: string) {
  return `interest-manual-st-${lineId}`
}
