export const PL_APPROPRIATION_CATEGORIES = [
  { id: 'dividend', label: 'Dividend / Distribution' },
  { id: 'general-reserve', label: 'Transfer to General Reserve' },
  { id: 'partners-remuneration', label: "Partners' Remuneration" },
  { id: 'tax-provision', label: 'Provision for Tax' },
  { id: 'charity', label: 'Charity / Donations' },
  { id: 'others', label: 'Others' },
] as const

export type PlAppropriationCategoryId = (typeof PL_APPROPRIATION_CATEGORIES)[number]['id']

const categoryLabelMap = new Map(
  PL_APPROPRIATION_CATEGORIES.map((item) => [item.id, item.label]),
)

export function getPlAppropriationCategoryLabel(categoryId: string) {
  return categoryLabelMap.get(categoryId as PlAppropriationCategoryId) ?? 'Others'
}

export function normalizePlAppropriationCategoryId(
  categoryId: string | undefined,
): PlAppropriationCategoryId {
  if (categoryId && categoryLabelMap.has(categoryId as PlAppropriationCategoryId)) {
    return categoryId as PlAppropriationCategoryId
  }
  return 'others'
}

export function plAppropriationSubId(lineId: string) {
  return `pl-appr-${lineId}`
}
