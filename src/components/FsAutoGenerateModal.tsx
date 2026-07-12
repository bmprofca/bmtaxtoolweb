import { useEffect, useMemo, useState } from 'react'
import { AdminExpenseLedgerPicker } from './AdminExpenseLedgerPicker'
import type { LedgerRecord } from '../types/ledger'
import type { AdministrativeExpenseLine } from '../types/fs'
import { formatAmount } from '../utils/fsCalculator'
import type {
  FsAutoGenerateBasis,
  FsAutoGenerateInputs,
  FsAutoGeneratePreview,
  FsAutoGenerateProfitInputMode,
  PriorYearProfitAnchors,
} from '../utils/fsAutoGenerator'
import {
  getAdminExpenseLedgers,
  resolveDefaultAdminLedgerIds,
  resolveFsAutoGenerateGrossProfit,
  resolveFsAutoGenerateNetProfit,
  resolveFsAutoGenerateSales,
  validateFsAutoGenerateInputs,
} from '../utils/fsAutoGenerator'
import './FsAutoGenerateModal.css'

interface FsAutoGenerateModalProps {
  hasPriorYear: boolean
  priorYearSales: number
  priorYearProfitAnchors: PriorYearProfitAnchors
  ledgers: LedgerRecord[]
  priorYearAdministrativeExpenseLines: AdministrativeExpenseLine[]
  onLedgersUpdated: (ledgers: LedgerRecord[]) => void
  onClose: () => void
  onGeneratePreview: (inputs: FsAutoGenerateInputs) => FsAutoGeneratePreview | null
  onApply: (preview: FsAutoGeneratePreview) => Promise<void>
}

function parseAmountInput(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatPercentOnSales(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return '—'
  }
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`
}

function PriorYearProfitStat({
  label,
  amount,
  pctOnSales,
  variant,
}: {
  label: string
  amount: number
  pctOnSales: number
  variant: 'gp' | 'np'
}) {
  return (
    <div
      className={`fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--readonly fs-auto-generate-anchor-cell--${variant}`}
    >
      <span className="fs-auto-generate-anchor-label">{label}</span>
      <strong className="fs-auto-generate-anchor-value">{formatAmount(amount)}</strong>
      <em className="fs-auto-generate-anchor-pct">{formatPercentOnSales(pctOnSales)} on sales</em>
    </div>
  )
}

function AnchorStatCell({
  label,
  amount,
  variant,
}: {
  label: string
  amount: number
  variant: 'sales' | 'target'
}) {
  return (
    <div
      className={`fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--readonly fs-auto-generate-anchor-cell--${variant}`}
    >
      <span className="fs-auto-generate-anchor-label">{label}</span>
      <strong className="fs-auto-generate-anchor-value">{formatAmount(amount)}</strong>
    </div>
  )
}

function formatPercentInput(value: number) {
  if (!Number.isFinite(value)) {
    return ''
  }
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

interface ProfitAnchorFieldProps {
  label: string
  mode: FsAutoGenerateProfitInputMode
  value: string
  computedAmount: number
  salesReady: boolean
  amountPlaceholder: string
  percentPlaceholder: string
  onModeChange: (mode: FsAutoGenerateProfitInputMode) => void
  onValueChange: (value: string) => void
}

function ProfitAnchorField({
  label,
  mode,
  value,
  computedAmount,
  salesReady,
  amountPlaceholder,
  percentPlaceholder,
  onModeChange,
  onValueChange,
}: ProfitAnchorFieldProps) {
  return (
    <div className="fs-auto-generate-field fs-auto-generate-field--anchor">
      <div className="fs-auto-generate-field-head">
        <span>{label}</span>
        <div className="fs-auto-generate-mode-toggle" role="group" aria-label={`${label} input mode`}>
          <button
            type="button"
            className={mode === 'amount' ? 'is-active' : ''}
            onClick={() => onModeChange('amount')}
          >
            Amt
          </button>
          <button
            type="button"
            className={mode === 'percent' ? 'is-active' : ''}
            onClick={() => onModeChange('percent')}
          >
            %
          </button>
        </div>
      </div>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={mode === 'percent' ? percentPlaceholder : amountPlaceholder}
      />
      {mode === 'percent' && salesReady && value.trim() !== '' && (
        <span className="fs-auto-generate-derived-inline">= {formatAmount(computedAmount)}</span>
      )}
    </div>
  )
}

function FsAutoGenerateModal({
  hasPriorYear,
  priorYearSales,
  priorYearProfitAnchors,
  ledgers,
  priorYearAdministrativeExpenseLines,
  onLedgersUpdated,
  onClose,
  onGeneratePreview,
  onApply,
}: FsAutoGenerateModalProps) {
  const [basis, setBasis] = useState<FsAutoGenerateBasis>(hasPriorYear ? 'prior-year' : 'fresh')
  const [sales, setSales] = useState('')
  const [salesIncreasePct, setSalesIncreasePct] = useState('10')
  const [grossProfit, setGrossProfit] = useState('')
  const [grossProfitInputMode, setGrossProfitInputMode] =
    useState<FsAutoGenerateProfitInputMode>('amount')
  const [netProfit, setNetProfit] = useState('')
  const [netProfitInputMode, setNetProfitInputMode] = useState<FsAutoGenerateProfitInputMode>('amount')
  const [indirectPct, setIndirectPct] = useState('12')
  const [randomSeed, setRandomSeed] = useState('')
  const [selectedAdminLedgerIds, setSelectedAdminLedgerIds] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<FsAutoGeneratePreview | null>(null)
  const [applying, setApplying] = useState(false)

  const adminLedgers = useMemo(() => getAdminExpenseLedgers(ledgers), [ledgers])
  const selectedAdminSet = useMemo(() => new Set(selectedAdminLedgerIds), [selectedAdminLedgerIds])

  useEffect(() => {
    setSelectedAdminLedgerIds((current) => {
      const availableIds = new Set(adminLedgers.map((ledger) => ledger.id))
      const kept = current.filter((ledgerId) => availableIds.has(ledgerId))
      if (kept.length > 0) {
        return kept
      }
      return resolveDefaultAdminLedgerIds(ledgers, priorYearAdministrativeExpenseLines)
    })
  }, [adminLedgers, ledgers, priorYearAdministrativeExpenseLines])

  useEffect(() => {
    setPreview(null)
    setErrors([])
  }, [
    basis,
    sales,
    salesIncreasePct,
    grossProfit,
    grossProfitInputMode,
    netProfit,
    netProfitInputMode,
    indirectPct,
    randomSeed,
    selectedAdminLedgerIds,
  ])

  const usePriorYearSales = hasPriorYear && basis === 'prior-year'

  const inputs = useMemo<FsAutoGenerateInputs>(
    () => ({
      basis: hasPriorYear ? basis : 'fresh',
      sales: parseAmountInput(sales),
      salesIncreasePctOnPriorYear: usePriorYearSales
        ? parseAmountInput(salesIncreasePct)
        : undefined,
      grossProfitInputMode,
      grossProfit: parseAmountInput(grossProfit),
      netProfitInputMode,
      netProfit: parseAmountInput(netProfit),
      indirectExpensePctOnSales: parseAmountInput(indirectPct),
      selectedAdminLedgerIds,
      randomSeed: randomSeed.trim() ? Number.parseInt(randomSeed, 10) : undefined,
    }),
    [
      basis,
      grossProfit,
      grossProfitInputMode,
      hasPriorYear,
      indirectPct,
      netProfit,
      netProfitInputMode,
      randomSeed,
      sales,
      salesIncreasePct,
      selectedAdminLedgerIds,
      usePriorYearSales,
    ],
  )

  const computedSales = resolveFsAutoGenerateSales(inputs, priorYearSales)
  const computedGrossProfit = resolveFsAutoGenerateGrossProfit(inputs, computedSales)
  const computedNetProfit = resolveFsAutoGenerateNetProfit(inputs, computedSales)
  const salesReady = computedSales > 0

  const switchGrossProfitMode = (nextMode: FsAutoGenerateProfitInputMode) => {
    if (nextMode === grossProfitInputMode) {
      return
    }
    if (salesReady && grossProfit.trim() !== '') {
      if (nextMode === 'percent') {
        setGrossProfit(formatPercentInput((computedGrossProfit / computedSales) * 100))
      } else {
        setGrossProfit(String(computedGrossProfit))
      }
    }
    setGrossProfitInputMode(nextMode)
  }

  const switchNetProfitMode = (nextMode: FsAutoGenerateProfitInputMode) => {
    if (nextMode === netProfitInputMode) {
      return
    }
    if (salesReady && netProfit.trim() !== '') {
      if (nextMode === 'percent') {
        setNetProfit(formatPercentInput((computedNetProfit / computedSales) * 100))
      } else {
        setNetProfit(String(computedNetProfit))
      }
    }
    setNetProfitInputMode(nextMode)
  }

  const toggleAdminLedger = (ledgerId: string) => {
    setSelectedAdminLedgerIds((current) => {
      if (current.includes(ledgerId)) {
        return current.filter((id) => id !== ledgerId)
      }
      return [...current, ledgerId]
    })
  }

  const handleAdminLedgerAdded = (ledgerId: string) => {
    setSelectedAdminLedgerIds((current) =>
      current.includes(ledgerId) ? current : [...current, ledgerId],
    )
  }

  const handleGeneratePreview = () => {
    const validation = validateFsAutoGenerateInputs(inputs, {
      hasPriorYear,
      priorYearSales,
      ledgers,
    })
    if (!validation.valid) {
      setErrors(validation.errors)
      setPreview(null)
      return
    }

    try {
      const nextPreview = onGeneratePreview(inputs)
      if (!nextPreview) {
        return
      }
      setErrors([])
      setPreview(nextPreview)
    } catch (error) {
      setPreview(null)
      setErrors([error instanceof Error ? error.message : 'Could not generate preview.'])
    }
  }

  const handleApply = async () => {
    if (!preview) {
      return
    }
    try {
      setApplying(true)
      await onApply(preview)
    } finally {
      setApplying(false)
    }
  }

  const previewPlRows = preview
    ? preview.profitAndLoss.filter((line) =>
        ['Revenue from Operation', 'Gross Profit', 'Net Profit / (Loss)'].includes(line.label),
      )
    : []

  return (
    <div className="modal-overlay fs-no-print fs-auto-generate-overlay">
      <div className="fs-auto-generate-modal" onClick={(event) => event.stopPropagation()}>
        <header className="fs-auto-generate-header">
          <div className="fs-auto-generate-header-main">
            <h3>Auto Generate</h3>
            <p>Preview draft figures, then apply. Save from the main screen.</p>
          </div>
          <div className="fs-auto-generate-basis-inline" role="group" aria-label="Generation basis">
            <button
              type="button"
              className={basis === 'prior-year' ? 'is-active' : ''}
              disabled={!hasPriorYear}
              onClick={() => hasPriorYear && setBasis('prior-year')}
              title={hasPriorYear ? 'Scale from prior year' : 'No prior year data'}
            >
              Prior year
            </button>
            <button
              type="button"
              className={basis === 'fresh' ? 'is-active' : ''}
              onClick={() => setBasis('fresh')}
            >
              Fresh
            </button>
          </div>
        </header>

        <div className="fs-auto-generate-body">
          <div className="fs-auto-generate-main-grid">
            <section className="fs-auto-generate-panel fs-auto-generate-panel--compact">
              <div className="fs-auto-generate-panel-title">P&amp;L anchors</div>
              <div className="fs-auto-generate-anchors">
                <div className="fs-auto-generate-anchor-group fs-auto-generate-anchor-group--sales">
                  <div className="fs-auto-generate-anchor-row">
                    {usePriorYearSales ? (
                      <>
                        <label className="fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input">
                          <span className="fs-auto-generate-anchor-label">Sales growth %</span>
                          <input
                            type="number"
                            step="any"
                            value={salesIncreasePct}
                            onChange={(event) => setSalesIncreasePct(event.target.value)}
                            placeholder="e.g. 10"
                          />
                        </label>
                        <AnchorStatCell
                          label="Prior sales"
                          amount={priorYearSales}
                          variant="sales"
                        />
                        <AnchorStatCell
                          label="Target sales"
                          amount={computedSales}
                          variant="target"
                        />
                      </>
                    ) : (
                      <label className="fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input fs-auto-generate-anchor-cell--span-3">
                        <span className="fs-auto-generate-anchor-label">Sales</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={sales}
                          onChange={(event) => setSales(event.target.value)}
                          placeholder="Revenue"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="fs-auto-generate-anchor-group fs-auto-generate-anchor-group--gp">
                  <div className="fs-auto-generate-anchor-row">
                    {usePriorYearSales && priorYearProfitAnchors.grossProfit > 0 ? (
                      <PriorYearProfitStat
                        label="Prior gross profit"
                        amount={priorYearProfitAnchors.grossProfit}
                        pctOnSales={priorYearProfitAnchors.grossProfitPctOnSales}
                        variant="gp"
                      />
                    ) : null}
                    <div
                      className={`fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input${
                        usePriorYearSales && priorYearProfitAnchors.grossProfit > 0
                          ? ' fs-auto-generate-anchor-cell--span-2'
                          : ' fs-auto-generate-anchor-cell--span-3'
                      }`}
                    >
                      <ProfitAnchorField
                        label="Gross Profit"
                        mode={grossProfitInputMode}
                        value={grossProfit}
                        computedAmount={computedGrossProfit}
                        salesReady={salesReady}
                        amountPlaceholder="≤ sales"
                        percentPlaceholder="% of sales"
                        onModeChange={switchGrossProfitMode}
                        onValueChange={setGrossProfit}
                      />
                    </div>
                  </div>
                </div>

                <div className="fs-auto-generate-anchor-group fs-auto-generate-anchor-group--np">
                  <div className="fs-auto-generate-anchor-row">
                    {usePriorYearSales && priorYearProfitAnchors.netProfit !== 0 ? (
                      <PriorYearProfitStat
                        label="Prior net profit"
                        amount={priorYearProfitAnchors.netProfit}
                        pctOnSales={priorYearProfitAnchors.netProfitPctOnSales}
                        variant="np"
                      />
                    ) : null}
                    <div
                      className={`fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input${
                        usePriorYearSales && priorYearProfitAnchors.netProfit !== 0
                          ? ' fs-auto-generate-anchor-cell--span-2'
                          : ' fs-auto-generate-anchor-cell--span-3'
                      }`}
                    >
                      <ProfitAnchorField
                        label="Net Profit"
                        mode={netProfitInputMode}
                        value={netProfit}
                        computedAmount={computedNetProfit}
                        salesReady={salesReady}
                        amountPlaceholder="≤ GP"
                        percentPlaceholder="% of sales"
                        onModeChange={switchNetProfitMode}
                        onValueChange={setNetProfit}
                      />
                    </div>
                  </div>
                </div>

                <div className="fs-auto-generate-anchor-group fs-auto-generate-anchor-group--misc">
                  <div className="fs-auto-generate-anchor-row">
                    <label className="fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input">
                      <span className="fs-auto-generate-anchor-label">Indirect %</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={indirectPct}
                        onChange={(event) => setIndirectPct(event.target.value)}
                      />
                    </label>
                    <label className="fs-auto-generate-anchor-cell fs-auto-generate-anchor-cell--input fs-auto-generate-anchor-cell--span-2">
                      <span className="fs-auto-generate-anchor-label">Seed</span>
                      <input
                        type="number"
                        step="1"
                        value={randomSeed}
                        onChange={(event) => setRandomSeed(event.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="fs-auto-generate-panel fs-auto-generate-panel--compact fs-auto-generate-panel--admin">
              <div className="fs-auto-generate-admin-toolbar">
                <div className="fs-auto-generate-panel-title">Admin expenses</div>
                <AdminExpenseLedgerPicker
                  ledgers={ledgers}
                  usedCategoryIds={[]}
                  onSelect={handleAdminLedgerAdded}
                  onLedgersUpdated={onLedgersUpdated}
                />
              </div>
              <p className="fs-auto-generate-panel-note">
                Toggle ledgers to include. Finance cost, depreciation, LT borrowings &amp; revenue
                authority are skipped.
              </p>

              {adminLedgers.length > 0 ? (
                <>
                  <div className="fs-auto-generate-chip-row">
                    {adminLedgers.map((ledger) => {
                      const selected = selectedAdminSet.has(ledger.id)
                      return (
                        <button
                          key={ledger.id}
                          type="button"
                          className={`fs-auto-generate-chip fs-auto-generate-chip--toggle${
                            selected ? ' is-selected' : ''
                          }`}
                          aria-pressed={selected}
                          onClick={() => toggleAdminLedger(ledger.id)}
                        >
                          <span className="fs-auto-generate-chip-mark" aria-hidden="true">
                            {selected ? '✓' : '+'}
                          </span>
                          {ledger.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="fs-auto-generate-hint">
                    {selectedAdminLedgerIds.length}/{adminLedgers.length} selected
                  </p>
                </>
              ) : (
                <p className="fs-auto-generate-hint">No admin ledgers — use Add expense line.</p>
              )}
            </section>
          </div>

          {errors.length > 0 && (
            <div className="fs-auto-generate-errors" role="alert">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {preview && (
            <section className="fs-auto-generate-preview">
              <div className="fs-auto-generate-preview-head">
                <h4>Preview</h4>
                <span
                  className={`fs-auto-generate-balance-pill${
                    preview.summary.diff === 0 ? ' is-balanced' : ''
                  }`}
                >
                  {preview.summary.diff === 0 ? 'Balanced' : `Diff ${formatAmount(preview.summary.diff)}`}
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="fs-auto-generate-warnings">
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}

              <div className="fs-auto-generate-preview-grid">
                <div className="fs-auto-generate-summary-grid">
                  <div>
                    <span>Sales</span>
                    <strong>{formatAmount(preview.summary.sales)}</strong>
                  </div>
                  <div>
                    <span>Gross Profit</span>
                    <strong>{formatAmount(preview.summary.grossProfit)}</strong>
                  </div>
                  <div>
                    <span>Net Profit</span>
                    <strong>{formatAmount(preview.summary.netProfit)}</strong>
                  </div>
                  <div>
                    <span>Indirect</span>
                    <strong>{formatAmount(preview.summary.indirectTotal)}</strong>
                  </div>
                </div>

                <table className="fs-auto-generate-preview-table">
                  <thead>
                    <tr>
                      <th>Particular</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPlRows.map((line) => (
                      <tr key={line.label}>
                        <td>{line.label}</td>
                        <td>{formatAmount(line.current)}</td>
                      </tr>
                    ))}
                    <tr className="fs-auto-generate-preview-total">
                      <td>Sources</td>
                      <td>{formatAmount(preview.summary.sourcesTotal)}</td>
                    </tr>
                    <tr className="fs-auto-generate-preview-total">
                      <td>Application</td>
                      <td>{formatAmount(preview.summary.applicationTotal)}</td>
                    </tr>
                    <tr
                      className={`fs-auto-generate-preview-diff${
                        preview.summary.diff === 0 ? ' is-balanced' : ''
                      }`}
                    >
                      <td>Balance</td>
                      <td>{formatAmount(preview.summary.diff)}</td>
                    </tr>
                  </tbody>
                </table>

                {preview.suggestedAdminExpenses.length > 0 && (
                  <div className="fs-auto-generate-admin-preview">
                    {preview.suggestedAdminExpenses.map((item) => (
                      <div key={item.label} className="fs-auto-generate-admin-item">
                        <span>{item.label}</span>
                        <strong>{formatAmount(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <footer className="fs-auto-generate-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button type="button" className="secondary-btn" onClick={handleGeneratePreview} disabled={applying}>
            Generate Preview
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!preview || applying}
            onClick={() => void handleApply()}
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default FsAutoGenerateModal
