import { useEffect, useMemo, useState } from 'react'
import { saveLoans } from '../api/fs'
import type { LoanClosingAdjustmentMode, LoanFormInput, LoanRecord } from '../types/loan'
import {
  calculateEmi,
  clampLoanMonthToFinancialYear,
  computeLoanForFinancialYear,
  createEmptyLoanForm,
  defaultClosingAdjustmentFields,
  getFinancialYearMonthBounds,
  getLoanBalanceAtMonthStart,
  loanToFormInput,
  normalizeLoanMonthField,
  summarizeCashFlowByYear,
} from '../utils/loanCalculator'
import { formatAmount } from '../utils/fsCalculator'
import { confirmSave, showAddedAlert, showUpdatedAlert } from '../utils/sweetAlert'
import LoanCashFlowTable from './LoanCashFlowTable'
import './LoanModal.css'

interface LoanModalProps {
  title: string
  clientId: string
  fyId: string
  businessId: string
  fyLabel: string
  fyStartYear: number
  fyEndYear: number
  existingLoans: LoanRecord[]
  loan?: LoanRecord | null
  openingBalanceReadOnly?: boolean
  onClose: () => void
  onSaved: (loans: LoanRecord[]) => void
}

function dateToMonthInput(value: string) {
  const normalized = normalizeLoanMonthField(value)
  if (!normalized) {
    return ''
  }

  return normalized.slice(0, 7)
}

function monthToIsoDate(value: string) {
  return normalizeLoanMonthField(value)
}

function LoanModal({
  title,
  clientId,
  fyId,
  businessId,
  fyLabel,
  fyStartYear,
  fyEndYear,
  existingLoans,
  loan,
  openingBalanceReadOnly = false,
  onClose,
  onSaved,
}: LoanModalProps) {
  const isEditMode = Boolean(loan)
  const [form, setForm] = useState<LoanFormInput>(() =>
    loan ? loanToFormInput(loan) : createEmptyLoanForm(fyStartYear),
  )
  const [preClosureEnabled, setPreClosureEnabled] = useState(
    () => Boolean(loan && (loan.prepaymentAmount > 0 || loan.prepaymentDate)),
  )
  const [closingAdjustmentEnabled, setClosingAdjustmentEnabled] = useState(
    () => Boolean(loan?.closingAdjustmentEnabled),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fyMonthBounds = useMemo(
    () => getFinancialYearMonthBounds(fyStartYear, fyEndYear),
    [fyStartYear, fyEndYear],
  )

  useEffect(() => {
    setForm(loan ? loanToFormInput(loan) : createEmptyLoanForm(fyStartYear))
    setPreClosureEnabled(Boolean(loan && (loan.prepaymentAmount > 0 || loan.prepaymentDate)))
    setClosingAdjustmentEnabled(Boolean(loan?.closingAdjustmentEnabled))
    setSaveError('')
  }, [loan, fyStartYear])

  const baseForm = useMemo<LoanFormInput>(() => {
    if (!isEditMode || !preClosureEnabled) {
      return {
        ...form,
        prepaymentAmount: 0,
        prepaymentDate: '',
      }
    }

    return form
  }, [form, isEditMode, preClosureEnabled])

  const effectiveForm = useMemo<LoanFormInput>(() => {
    if (!closingAdjustmentEnabled) {
      return {
        ...baseForm,
        ...defaultClosingAdjustmentFields(),
      }
    }

    return {
      ...baseForm,
      closingAdjustmentEnabled: true,
    }
  }, [baseForm, closingAdjustmentEnabled])

  const preview = useMemo(
    () => computeLoanForFinancialYear({ ...effectiveForm, id: loan?.id }, fyStartYear, fyEndYear),
    [effectiveForm, loan?.id, fyStartYear, fyEndYear],
  )

  const scheduleClosingBalance =
    preview.scheduleClosingBalance ?? preview.closingBalance
  const hasClosingAdjustment =
    closingAdjustmentEnabled &&
    (preview.closingAdjustmentPrincipalApplied !== 0 ||
      preview.closingAdjustmentInterestApplied !== 0 ||
      preview.closingBalance !== scheduleClosingBalance)

  const updateField = (field: keyof LoanFormInput, value: string) => {
    setForm((current) => {
      const next: LoanFormInput = {
        ...current,
        [field]:
          field === 'lender' || field.endsWith('Date')
            ? value
            : field === 'loanType'
              ? (value as LoanFormInput['loanType'])
              : Number(value) || 0,
      }

      if (field === 'disbursementDate' && value) {
        const normalizedDisbursement = clampLoanMonthToFinancialYear(
          monthToIsoDate(value),
          fyStartYear,
          fyEndYear,
        )
        next.disbursementDate = normalizedDisbursement

        if (
          !current.emiStartDate ||
          normalizeLoanMonthField(current.emiStartDate) ===
            normalizeLoanMonthField(current.disbursementDate)
        ) {
          next.emiStartDate = normalizedDisbursement
        }
      }

      if (field === 'emiStartDate' && value) {
        next.emiStartDate = clampLoanMonthToFinancialYear(
          monthToIsoDate(value),
          fyStartYear,
          fyEndYear,
        )
      }

      if (field === 'prepaymentDate' && value) {
        const normalizedPreClosureDate = clampLoanMonthToFinancialYear(
          monthToIsoDate(value),
          fyStartYear,
          fyEndYear,
        )
        next.prepaymentDate = normalizedPreClosureDate
        next.prepaymentAmount = getLoanBalanceAtMonthStart(
          {
            ...current,
            prepaymentAmount: 0,
            prepaymentDate: '',
          },
          fyStartYear,
          normalizedPreClosureDate,
        )
      }

      return next
    })
  }

  const handleSave = async () => {
    if (!form.lender.trim() || saving) {
      return
    }

    if (form.tenureMonths < 1) {
      setSaveError('Tenure must be at least 1 month.')
      return
    }

    const principal = form.openingBalance + form.disbursement
    if (principal <= 0) {
      setSaveError('Enter opening balance or a new loan / disbursement amount.')
      return
    }

    if (isEditMode && preClosureEnabled) {
      if (!form.prepaymentDate) {
        setSaveError('Select the pre-closure month.')
        return
      }
      if (form.prepaymentAmount <= 0) {
        setSaveError('Enter the pre-closure amount.')
        return
      }
    }

    if (closingAdjustmentEnabled) {
      if (form.closingAdjustmentMode === 'target-balance' && form.closingAdjustmentTargetBalance < 0) {
        setSaveError('Target closing balance cannot be negative.')
        return
      }
    }

    const confirmed = await confirmSave({
      action: loan ? 'edit' : 'add',
      itemLabel: form.lender.trim(),
    })
    if (!confirmed) {
      return
    }

    const computed = computeLoanForFinancialYear(
      { ...effectiveForm, id: loan?.id },
      fyStartYear,
      fyEndYear,
    )

    const existing = existingLoans.find((item) => item.id === computed.id)
    const nextLoan: LoanRecord =
      existing && openingBalanceReadOnly
        ? {
            ...computed,
            openingBalance: existing.openingBalance,
            prepaymentAmount: effectiveForm.prepaymentAmount,
            prepaymentDate: effectiveForm.prepaymentDate,
            closingAdjustmentEnabled: effectiveForm.closingAdjustmentEnabled,
            closingAdjustmentMode: effectiveForm.closingAdjustmentMode,
            closingAdjustmentPrincipal: effectiveForm.closingAdjustmentPrincipal,
            closingAdjustmentInterest: effectiveForm.closingAdjustmentInterest,
            closingAdjustmentTargetBalance: effectiveForm.closingAdjustmentTargetBalance,
          }
        : {
            id: computed.id,
            lender: computed.lender,
            loanType: computed.loanType,
            openingBalance: computed.openingBalance,
            disbursement: computed.disbursement,
            disbursementDate: computed.disbursementDate,
            interestRate: computed.interestRate,
            tenureMonths: computed.tenureMonths,
            emiStartDate: computed.emiStartDate,
            prepaymentAmount: effectiveForm.prepaymentAmount,
            prepaymentDate: effectiveForm.prepaymentDate,
            closingAdjustmentEnabled: effectiveForm.closingAdjustmentEnabled,
            closingAdjustmentMode: effectiveForm.closingAdjustmentMode,
            closingAdjustmentPrincipal: effectiveForm.closingAdjustmentPrincipal,
            closingAdjustmentInterest: effectiveForm.closingAdjustmentInterest,
            closingAdjustmentTargetBalance: effectiveForm.closingAdjustmentTargetBalance,
          }

    const exists = existingLoans.some((item) => item.id === nextLoan.id)
    const loans = exists
      ? existingLoans.map((item) => (item.id === nextLoan.id ? nextLoan : item))
      : [...existingLoans, nextLoan]

    setSaving(true)
    setSaveError('')

    try {
      const { loans: savedLoans } = await saveLoans(clientId, fyId, businessId, loans)
      onSaved(savedLoans)
      onClose()

      if (exists) {
        await showUpdatedAlert(nextLoan.lender)
      } else {
        await showAddedAlert(nextLoan.lender)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save loan')
    } finally {
      setSaving(false)
    }
  }

  const basePrincipal = form.openingBalance + form.disbursement
  const estimatedEmi = calculateEmi(basePrincipal, form.interestRate, Math.max(1, form.tenureMonths))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="loan-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="loan-modal-subtitle">
          FY {fyLabel} (Apr {fyStartYear} – Mar {fyEndYear}) — confirm to save immediately. The full
          EMI schedule starts from the selected installment month and continues until the loan is fully
          repaid.
        </p>

        {saveError && <div className="alert loan-modal-error">{saveError}</div>}

        <div className="loan-form-grid">
          <label className="loan-field loan-field--wide">
            Lender / Bank
            <input
              value={form.lender}
              onChange={(e) => updateField('lender', e.target.value)}
              placeholder="Lender name"
              autoFocus
              disabled={saving}
            />
          </label>

          <label className="loan-field">
            Loan Type
            <select
              value={form.loanType}
              onChange={(e) => updateField('loanType', e.target.value)}
              disabled={saving}
            >
              <option value="long-term">Long-term (Secured Loans)</option>
              <option value="short-term">Short-term (Unsecured Loans)</option>
            </select>
          </label>

          {openingBalanceReadOnly && (
            <label className="loan-field loan-field--readonly">
              Opening Balance (from previous year)
              <input
                type="number"
                value={form.openingBalance || ''}
                onChange={(e) => updateField('openingBalance', e.target.value)}
                readOnly
                title="Opening balance from previous year loan closing"
                className="fs-readonly-input"
                placeholder="0"
              />
              <span className="loan-field-hint">Locked from previous year closing balance</span>
            </label>
          )}

          {!openingBalanceReadOnly && (
            <label className="loan-field">
              Opening Balance
              <input
                type="number"
                value={form.openingBalance || ''}
                onChange={(e) => updateField('openingBalance', e.target.value)}
                placeholder="0"
                disabled={saving}
              />
            </label>
          )}

          <label className="loan-field">
            New Loan / Disbursement
            <input
              type="number"
              value={form.disbursement || ''}
              onChange={(e) => updateField('disbursement', e.target.value)}
              placeholder="0"
              disabled={saving}
            />
          </label>

          <label className="loan-field">
            Disbursement Period (FY month)
            <input
              type="month"
              className="loan-period-input"
              min={fyMonthBounds.min}
              max={fyMonthBounds.max}
              value={dateToMonthInput(form.disbursementDate)}
              onChange={(e) => updateField('disbursementDate', e.target.value)}
              disabled={saving}
            />
          </label>

          <label className="loan-field">
            Interest Rate (% p.a.)
            <input
              type="number"
              step="0.01"
              value={form.interestRate || ''}
              onChange={(e) => updateField('interestRate', e.target.value)}
              placeholder="0"
              disabled={saving}
            />
          </label>

          <label className="loan-field">
            Tenure (months)
            <input
              type="number"
              min={1}
              value={form.tenureMonths || ''}
              onChange={(e) => updateField('tenureMonths', e.target.value)}
              placeholder="12"
              disabled={saving}
            />
          </label>

          <label className="loan-field">
            Start Installment Period (FY month)
            <input
              type="month"
              className="loan-period-input"
              min={fyMonthBounds.min}
              max={fyMonthBounds.max}
              value={dateToMonthInput(form.emiStartDate)}
              onChange={(e) => updateField('emiStartDate', e.target.value)}
              disabled={saving}
            />
            <span className="loan-field-hint">
              First EMI falls in this month (defaults to disbursement month)
            </span>
          </label>

          {isEditMode && (
            <div className="loan-field loan-field--wide loan-preclosure-panel">
              <label className="loan-preclosure-toggle">
                <input
                  type="checkbox"
                  checked={preClosureEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setPreClosureEnabled(enabled)
                    if (!enabled) {
                      setForm((current) => ({
                        ...current,
                        prepaymentAmount: 0,
                        prepaymentDate: '',
                      }))
                    }
                  }}
                  disabled={saving}
                />
                Apply pre-closure
              </label>
              {preClosureEnabled && (
                <div className="loan-preclosure-fields">
                  <label className="loan-field">
                    Pre-closure Month
                    <input
                      type="month"
                      className="loan-period-input"
                      min={fyMonthBounds.min}
                      max={fyMonthBounds.max}
                      value={dateToMonthInput(form.prepaymentDate)}
                      onChange={(e) => updateField('prepaymentDate', e.target.value)}
                      disabled={saving}
                    />
                  </label>
                  <label className="loan-field">
                    Pre-closure Amount
                    <input
                      type="number"
                      value={form.prepaymentAmount || ''}
                      onChange={(e) => updateField('prepaymentAmount', e.target.value)}
                      placeholder="Auto-filled from month"
                      disabled={saving}
                    />
                    <span className="loan-field-hint">
                      Fills automatically when you select the pre-closure month
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="loan-field loan-field--wide loan-preclosure-panel loan-closing-adj-panel">
            <label className="loan-preclosure-toggle">
              <input
                type="checkbox"
                checked={closingAdjustmentEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setClosingAdjustmentEnabled(enabled)
                  if (enabled) {
                    setForm((current) => ({
                      ...current,
                      closingAdjustmentEnabled: true,
                      closingAdjustmentMode: current.closingAdjustmentMode || 'principal-interest',
                      closingAdjustmentTargetBalance:
                        current.closingAdjustmentTargetBalance || scheduleClosingBalance,
                    }))
                  } else {
                    setForm((current) => ({
                      ...current,
                      ...defaultClosingAdjustmentFields(),
                    }))
                  }
                }}
                disabled={saving}
              />
              Adjust closing balance (this financial year)
            </label>
            {closingAdjustmentEnabled && (
              <div className="loan-closing-adj-body">
                <p className="loan-field-hint loan-closing-adj-intro">
                  Use this when the EMI schedule closing balance does not match your books for Mar{' '}
                  {fyEndYear}. Adjustments apply only to this FY and carry forward to the next year
                  opening balance.
                </p>
                <div className="loan-closing-adj-mode">
                  <label className="loan-closing-adj-mode-option">
                    <input
                      type="radio"
                      name="closingAdjustmentMode"
                      value="principal-interest"
                      checked={form.closingAdjustmentMode === 'principal-interest'}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          closingAdjustmentMode: 'principal-interest' as LoanClosingAdjustmentMode,
                          closingAdjustmentEnabled: true,
                        }))
                      }
                      disabled={saving}
                    />
                    By principal &amp; interest
                  </label>
                  <label className="loan-closing-adj-mode-option">
                    <input
                      type="radio"
                      name="closingAdjustmentMode"
                      value="target-balance"
                      checked={form.closingAdjustmentMode === 'target-balance'}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          closingAdjustmentMode: 'target-balance' as LoanClosingAdjustmentMode,
                          closingAdjustmentEnabled: true,
                          closingAdjustmentTargetBalance:
                            current.closingAdjustmentTargetBalance || scheduleClosingBalance,
                        }))
                      }
                      disabled={saving}
                    />
                    Set target closing balance
                  </label>
                </div>
                {form.closingAdjustmentMode === 'principal-interest' ? (
                  <div className="loan-preclosure-fields">
                    <label className="loan-field">
                      Principal adjustment
                      <input
                        type="number"
                        value={form.closingAdjustmentPrincipal || ''}
                        onChange={(e) => updateField('closingAdjustmentPrincipal', e.target.value)}
                        placeholder="0"
                        disabled={saving}
                      />
                      <span className="loan-field-hint">
                        Positive = extra principal repaid (reduces closing balance)
                      </span>
                    </label>
                    <label className="loan-field">
                      Interest adjustment
                      <input
                        type="number"
                        value={form.closingAdjustmentInterest || ''}
                        onChange={(e) => updateField('closingAdjustmentInterest', e.target.value)}
                        placeholder="0"
                        disabled={saving}
                      />
                      <span className="loan-field-hint">
                        Adjusts interest expense for this FY only (does not change closing)
                      </span>
                    </label>
                  </div>
                ) : (
                  <label className="loan-field loan-field--wide">
                    Target closing balance (Mar {fyEndYear})
                    <input
                      type="number"
                      min={0}
                      value={form.closingAdjustmentTargetBalance || ''}
                      onChange={(e) =>
                        updateField('closingAdjustmentTargetBalance', e.target.value)
                      }
                      placeholder={String(scheduleClosingBalance)}
                      disabled={saving}
                    />
                    <span className="loan-field-hint">
                      Schedule closing: {formatAmount(scheduleClosingBalance)} → implied principal
                      adjustment:{' '}
                      {formatAmount(
                        scheduleClosingBalance - (form.closingAdjustmentTargetBalance || 0),
                      )}
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="loan-preview">
          <p>
            <strong>Estimated EMI:</strong> {formatAmount(estimatedEmi)} |{' '}
            <strong>Interest this FY:</strong> {formatAmount(preview.interestForYear)} |{' '}
            <strong>Principal this FY:</strong> {formatAmount(preview.principalRepaid)} |{' '}
            <strong>Closing Balance:</strong> {formatAmount(preview.closingBalance)}
            {hasClosingAdjustment && (
              <>
                {' '}
                <span className="loan-closing-adj-badge">
                  (schedule: {formatAmount(scheduleClosingBalance)})
                </span>
              </>
            )}
          </p>
        </div>

        <LoanCashFlowTable
          title="Cash flow by year (projected until loan closure)"
          rows={summarizeCashFlowByYear(preview.monthlySchedule)}
          compact
        />

        {preview.monthlySchedule.length > 0 && (
          <div className="table-wrap loan-schedule-preview">
            <table className="loan-preview-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Month</th>
                  <th>Year</th>
                  <th>EMI</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {preview.monthlySchedule.map((row) => (
                  <tr
                    key={`${row.serialNo}-${row.year}-${row.month}`}
                    className={row.isPrepayment || row.isPreClosure ? 'prepay-row' : undefined}
                  >
                    <td>{row.serialNo}</td>
                    <td>
                      {row.monthLabel}
                      {row.isPreClosure || row.isPrepayment ? ' (Pre-closure)' : ''}
                    </td>
                    <td>{row.year}</td>
                    <td>{formatAmount(row.emi)}</td>
                    <td>{formatAmount(row.principal)}</td>
                    <td>{formatAmount(row.interest)}</td>
                    <td>{formatAmount(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="loan-modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void handleSave()}
            disabled={!form.lender.trim() || saving}
          >
            {saving ? 'Saving…' : loan ? 'Update Loan' : 'Add Loan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoanModal
