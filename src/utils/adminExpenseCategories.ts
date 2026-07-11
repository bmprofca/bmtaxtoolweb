export const ADMIN_EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'Rent' },
  { id: 'electricity-water', label: 'Electricity & Water' },
  { id: 'telephone-internet', label: 'Telephone & Internet' },
  { id: 'printing-stationery', label: 'Printing & Stationery' },
  { id: 'travelling-conveyance', label: 'Travelling & Conveyance' },
  { id: 'legal-professional', label: 'Legal & Professional Fees' },
  { id: 'audit-fees', label: 'Audit Fees' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'repairs-maintenance', label: 'Repairs & Maintenance' },
  { id: 'advertisement', label: 'Advertisement & Publicity' },
  { id: 'office-expenses', label: 'Office Expenses' },
  { id: 'commission', label: 'Commission' },
  { id: 'bank-charges', label: 'Bank Charges' },
  { id: 'rates-taxes', label: 'Rates & Taxes' },
  { id: 'donations', label: 'Donations' },
  { id: 'miscellaneous', label: 'Miscellaneous Expenses' },
  { id: 'others', label: 'Others' },
] as const

export type AdminExpenseCategoryId = (typeof ADMIN_EXPENSE_CATEGORIES)[number]['id']

const categoryLabelMap = new Map(
  ADMIN_EXPENSE_CATEGORIES.map((item) => [item.id, item.label]),
)

const categoryIdSet = new Set(ADMIN_EXPENSE_CATEGORIES.map((item) => item.id))

export function isLegacyAdminCategoryId(categoryId: string) {
  return categoryIdSet.has(categoryId as AdminExpenseCategoryId)
}

export function getAdminCategoryLabel(categoryId: string) {
  return categoryLabelMap.get(categoryId as AdminExpenseCategoryId) ?? 'Others'
}

export function normalizeAdminCategoryId(categoryId: string | undefined): string {
  return categoryId || 'others'
}

export function adminExpenseSubId(lineId: string) {
  return `admin-line-${lineId}`
}
