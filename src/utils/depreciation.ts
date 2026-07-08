import type { DepreciationRow } from '../types/fs'

function n(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

/** Indian Income Tax Act — Section 32: 50% depreciation if used < 180 days (on/after 3rd Oct). */
export function recalcDepreciationRow(
  row: DepreciationRow & { addition?: number },
): DepreciationRow {
  const openingWdv = n(row.openingWdv)
  const additionBeforeOct3 = n(row.additionBeforeOct3 ?? row.addition)
  const additionOnAfterOct3 = n(row.additionOnAfterOct3)
  const assetDeletion = n(row.assetDeletion)
  const rate = n(row.rate)

  const openingBase = Math.max(0, openingWdv - assetDeletion)
  const depOnOpening = (openingBase * rate) / 100
  const depOnBeforeOct3 = (additionBeforeOct3 * rate) / 100
  const depOnAfterOct3 = (additionOnAfterOct3 * rate) / 100 * 0.5

  const depreciation = Math.round(depOnOpening + depOnBeforeOct3 + depOnAfterOct3)
  const closingWdv = Math.max(
    0,
    openingWdv + additionBeforeOct3 + additionOnAfterOct3 - assetDeletion - depreciation,
  )

  return {
    id: row.id,
    ledgerId: row.ledgerId,
    assetName: row.assetName,
    purchaseDate: row.purchaseDate,
    rate,
    openingWdv,
    additionBeforeOct3,
    additionOnAfterOct3,
    assetDeletion,
    depreciation,
    closingWdv,
  }
}

/** Prefer recalculated closing; fall back to stored closing when inputs were not fully saved. */
export function resolveEffectiveClosingWdv(row: DepreciationRow): number {
  const calc = recalcDepreciationRow(row)
  if (calc.closingWdv > 0) {
    return calc.closingWdv
  }
  const stored = Number(row.closingWdv)
  return Number.isFinite(stored) && stored > 0 ? stored : 0
}

export function sumDepreciationSchedule(schedule: DepreciationRow[]) {
  const rows = normalizeDepreciationSchedule(schedule)

  return {
    openingWdv: rows.reduce((t, r) => t + r.openingWdv, 0),
    additionBeforeOct3: rows.reduce((t, r) => t + r.additionBeforeOct3, 0),
    additionOnAfterOct3: rows.reduce((t, r) => t + r.additionOnAfterOct3, 0),
    assetDeletion: rows.reduce((t, r) => t + r.assetDeletion, 0),
    depreciation: rows.reduce((t, r) => t + r.depreciation, 0),
    closingWdv: rows.reduce((t, r) => t + r.closingWdv, 0),
  }
}

export function normalizeDepreciationSchedule(
  schedule: (DepreciationRow & { addition?: number })[],
): DepreciationRow[] {
  return schedule.map((row) => {
    const calc = recalcDepreciationRow(row)
    const storedClosing = Number(row.closingWdv)
    const closingWdv =
      calc.closingWdv > 0
        ? calc.closingWdv
        : Number.isFinite(storedClosing) && storedClosing > 0
          ? storedClosing
          : 0
    return { ...calc, closingWdv }
  })
}

/** Blank row created for new FY — not a real asset block. */
export function isPlaceholderDepreciationRow(row: DepreciationRow): boolean {
  const calc = recalcDepreciationRow(row)
  return (
    !row.ledgerId &&
    !String(row.assetName || '').trim() &&
    calc.openingWdv === 0 &&
    calc.additionBeforeOct3 === 0 &&
    calc.additionOnAfterOct3 === 0 &&
    calc.assetDeletion === 0 &&
    calc.depreciation === 0 &&
    calc.closingWdv === 0 &&
    calc.rate === 0
  )
}

export function getDepreciationClosingWdv(row: DepreciationRow): number {
  return resolveEffectiveClosingWdv(row)
}
