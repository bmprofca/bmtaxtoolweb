import { useEffect, useMemo, useState } from 'react'
import type { LoanFormInput, LoanRecord } from '../types/loan'
import {
  calculateEmi,
  computeLoanForFinancialYear,
  createEmptyLoanForm,
  loanToFormInput,
  summarizeCashFlowByYear,
} from '../utils/loanCalculator'
import { formatAmount } from '../utils/fsCalculator'
import { confirmSave } from '../utils/sweetAlert'
import LoanCashFlowTable from './LoanCashFlowTable'
import './LoanModal.css'

interface LoanModalProps {
  title: string
  fyLabel: string
  fyStartYear: number
  fyEndYear: number
  loan?: LoanRecord | null
  openingBalanceReadOnly?: boolean
  onClose: () => void
  onSave: (loan: LoanRecord) => void
}

function dateToMonthInput(value: string) {
  if (!value) {
    return ''
  }
  const parts = value.split('-')
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`
  }
  return ''
}

function monthToIsoDate(value: string) {
  if (!value) {
    return ''
  }
  return `${value}-01`
}

function LoanModal({
  title,
  fyLabel,
  fyStartYear,
  fyEndYear,
  loan,
  openingBalanceReadOnly = false,
  onClose,
  onSave,
}: LoanModalProps) {
  const [form, setForm] = useState<LoanFormInput>(() =>
    loan ? loanToFormInput(loan) : createEmptyLoanForm(),
  )

  useEffect(() => {
    setForm(loan ? loanToFormInput(loan) : createEmptyLoanForm())
  }, [loan])

  const preview = useMemo(
    () => computeLoanForFinancialYear({ ...form, id: loan?.id }, fyStartYear, fyEndYear),
    [form, loan?.id, fyStartYear, fyEndYear],
  )

  const updateField = (field: keyof LoanFormInput, value: string) => {
    setForm((current) => ({
      ...current,
      [field]:
        field === 'lender' || field.endsWith('Date')
          ? value
          : field === 'loanType'
            ? (value as LoanFormInput['loanType'])
            : Number(value) || 0,
    }))
  }

  const handleSave = async () => {
    if (!form.lender.trim()) {
      return
    }

    const confirmed = await confirmSave({
      action: loan ? 'edit' : 'add',
      itemLabel: form.lender.trim(),
    })
    if (!confirmed) {
      return
    }

    const computed = computeLoanForFinancialYear(
      { ...form, id: loan?.id },
      fyStartYear,
      fyEndYear,
    )

    onSave({
      id: computed.id,
      lender: computed.lender,
      loanType: computed.loanType,
      openingBalance: computed.openingBalance,
      disbursement: computed.disbursement,
      disbursementDate: computed.disbursementDate,
      interestRate: computed.interestRate,
      tenureMonths: computed.tenureMonths,
      emiStartDate: computed.emiStartDate,
      prepaymentAmount: computed.prepaymentAmount,
      prepaymentDate: computed.prepaymentDate,
    })
    onClose()
  }

  const basePrincipal = form.openingBalance + form.disbursement
  const estimatedEmi = calculateEmi(basePrincipal, form.interestRate, form.tenureMonths)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="loan-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="loan-modal-subtitle">
          FY {fyLabel} — EMI schedule is generated from the details below
        </p>

        <div className="loan-form-grid">
          <label className="loan-field loan-field--wide">
            Lender / Bank
            <input
              value={form.lender}
              onChange={(e) => updateField('lender', e.target.value)}
              placeholder="Lender name"
              autoFocus
            />
          </label>

          <label className="loan-field">
            Loan Type
            <select
              value={form.loanType}
              onChange={(e) => updateField('loanType', e.target.value)}
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

          <label className="loan-field">
            New Loan / Disbursement
            <input
              type="number"
              value={form.disbursement || ''}
              onChange={(e) => updateField('disbursement', e.target.value)}
              placeholder="0"
            />
          </label>

          <label className="loan-field">
            Disbursement Period
            <input
              type="month"
              className="loan-period-input"
              value={dateToMonthInput(form.disbursementDate)}
              onChange={(e) => updateField('disbursementDate', monthToIsoDate(e.target.value))}
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
            />
          </label>

          <label className="loan-field">
            Tenure (months)
            <input
              type="number"
              value={form.tenureMonths || ''}
              onChange={(e) => updateField('tenureMonths', e.target.value)}
              placeholder="12"
            />
          </label>

          <label className="loan-field">
            Loan Commencement Period
            <input
              type="month"
              className="loan-period-input"
              value={dateToMonthInput(form.emiStartDate)}
              onChange={(e) => updateField('emiStartDate', monthToIsoDate(e.target.value))}
            />
          </label>

          <label className="loan-field">
            Prepayment Amount (optional)
            <input
              type="number"
              value={form.prepaymentAmount || ''}
              onChange={(e) => updateField('prepaymentAmount', e.target.value)}
              placeholder="0"
            />
          </label>

          <label className="loan-field">
            Prepayment Period (optional)
            <input
              type="month"
              className="loan-period-input"
              value={dateToMonthInput(form.prepaymentDate)}
              onChange={(e) => updateField('prepaymentDate', monthToIsoDate(e.target.value))}
            />
          </label>
        </div>

        <div className="loan-preview">
          <p>
            <strong>Estimated EMI:</strong> {formatAmount(estimatedEmi)} |{' '}
            <strong>Interest this FY:</strong> {formatAmount(preview.interestForYear)} |{' '}
            <strong>Principal this FY:</strong> {formatAmount(preview.principalRepaid)} |{' '}
            <strong>Closing Balance:</strong> {formatAmount(preview.closingBalance)}
          </p>
        </div>

        <LoanCashFlowTable
          title="Cash flow by year"
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
                  <tr key={`${row.serialNo}-${row.month}`} className={row.isPrepayment ? 'prepay-row' : undefined}>
                    <td>{row.serialNo}</td>
                    <td>
                      {row.monthLabel}
                      {row.isPrepayment ? ' (Prepay)' : ''}
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
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSave}
            disabled={!form.lender.trim()}
          >
            {loan ? 'Update Loan' : 'Add Loan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoanModal
